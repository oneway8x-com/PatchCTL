import { test, expect } from "@playwright/test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { z } from "zod";
const sessionSchema = z.object({
  humanToken: z.string(),
  agentToken: z.string(),
  sourceId: z.string(),
  tenantId: z.string(),
});
test("local CLI submits an immutable patch and human review never writes the content database", async ({
  page,
  request,
}) => {
  const session = sessionSchema.parse(
    JSON.parse(await readFile(process.env.PATCHCTL_DEMO_SESSION!, "utf8")),
  );
  const url = process.env.PATCHCTL_CONTENT_TEST_DATABASE_URL!;
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  expect(
    ["localhost", "127.0.0.1"].includes(parsed.hostname) &&
      /_(test|demo)$/.test(database),
  ).toBe(true);
  const home = await mkdtemp(join(tmpdir(), "patchctl-e2e-"));
  const namespace = `local_${crypto.randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url });
  async function cli(args: string[], success = true): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../../../cli/dist/cli.js", import.meta.url)),
          ...args,
          "--json",
        ],
        {
          windowsHide: true,
          stdio: "pipe",
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            TZ: process.env.TZ,
            PATCHCTL_HOME: home,
            PATCHCTL_DATABASE_URL: url,
            PATCHCTL_TOKEN: session.agentToken,
          },
        },
      );
      let output = "",
        errors = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        errors += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if ((code === 0) !== success)
          return reject(
            new Error(`CLI ${args[0]} failed: ${errors || output}`),
          );
        resolve(JSON.parse(output || errors));
      });
      child.stdin.end();
    });
  }
  try {
    await pool.query(`CREATE SCHEMA "${namespace}"`);
    await pool.query(
      `CREATE TABLE "${namespace}".articles (id integer PRIMARY KEY, title text NOT NULL, score integer CHECK(score>=0), private_note text)`,
    );
    await pool.query(
      `INSERT INTO "${namespace}".articles VALUES (1,'Old title',1,'never uploaded'),(2,'Second title',2,'also private')`,
    );
    await cli(["connect"]);
    await cli([
      "init",
      "--resources",
      `${namespace}.articles`,
      "--columns",
      "id,title,score",
    ]);
    await cli(["login", "--server", "http://127.0.0.1:3110"]);
    await cli(["patch", "start", "--title", "Improve article title"]);
    await cli([
      "update",
      "articles",
      "1",
      "--set",
      "title=A better article title",
    ]);
    await cli(["validate"]);
    const proposal = z
      .object({
        patchId: z.string(),
        revision: z.string(),
        reviewUrl: z.string(),
      })
      .parse(await cli(["submit"]));
    expect(await cli(["submit"])).toMatchObject({
      patchId: proposal.patchId,
      revision: proposal.revision,
    });
    const submitted = await request.get(
      `/api/patchctl/local-patches/${proposal.patchId}`,
      { headers: { Authorization: `Bearer ${session.agentToken}` } },
    );
    const body = await submitted.text();
    expect(body).not.toContain("never uploaded");
    expect(body).not.toContain(url);
    const denied = await request.post(
      `/api/patchctl/local-patches/${proposal.patchId}/decision`,
      {
        headers: { Authorization: `Bearer ${session.agentToken}` },
        data: { revision: proposal.revision, decision: "APPROVED" },
      },
    );
    expect(denied.status()).toBe(403);
    await page.addInitScript(
      (token) => localStorage.setItem("accessToken", token),
      session.humanToken,
    );
    await page.goto(proposal.reviewUrl);
    await expect(page.getByTestId("record-diff")).toContainText("Old title");
    await expect(page.getByTestId("record-diff")).toContainText(
      "A better article title",
    );
    await page.screenshot({
      path: "./.patchctl-results/local/review.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByTestId("patch-state")).toHaveText("APPROVED");
    expect(
      (await pool.query(`SELECT title FROM "${namespace}".articles WHERE id=1`))
        .rows[0].title,
    ).toBe("Old title");
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await pool.end();
    await rm(home, { recursive: true, force: true });
  }
});
