import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

test("real CLI → ten English summaries → browser approval → Postgres; reject and conflict safely", async ({ page, request }) => {
  const session = JSON.parse(await readFile(process.env.PATCHCTL_DEMO_SESSION!, "utf8"));
  const pool = new Pool({ connectionString: session.url });
  async function cli(args: string[], input?: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL("../../../../packages/patchctl-cli/cli.mjs", import.meta.url)), ...args], {
        windowsHide: true, env: { ...process.env, PATCHCTL_URL: "http://127.0.0.1:3108", PATCHCTL_TOKEN: session.agentToken }, stdio: "pipe",
      });
      let output = "", error = "";
      child.stdout.on("data", chunk => output += chunk); child.stderr.on("data", chunk => error += chunk);
      child.on("error", reject); child.on("close", code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)));
      child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
    });
  }
  const rows = async () => (await pool.query(`SELECT * FROM "${session.namespace}".articles ORDER BY id`)).rows;
  try {
    await page.addInitScript(token => localStorage.setItem("accessToken", token), session.humanToken);
    const before = await rows();
    const read = await cli(["read", session.sourceId, "--stdin"], { filters: [{ field: "summary_en", op: "missing" }] });
    expect(read.records).toHaveLength(10);
    const proposal = await cli(["propose", "--stdin"], { sourceId: session.sourceId, schemaVersion: read.schemaVersion,
      mode: "fill-missing", reason: "Add English summaries to all articles missing one.", agentRunLabel: "deterministic-demo",
      records: read.records.map((record: any) => ({ id: record.id, version: record.version, changes: { summary_en: `Article ${Number(record.id)} explains safe, human-reviewed content updates.` } })) });
    expect(await rows()).toEqual(before);
    const forbidden = await request.post(`/api/patchctl/patches/${proposal.id}/decision`, { headers: { Authorization: `Bearer ${session.agentToken}` }, data: { revision: proposal.revision, decision: "approved" } });
    expect(forbidden.status()).toBe(403);
    await page.goto(proposal.reviewUrl);
    await expect(page.getByTestId("record-diff")).toHaveCount(10);
    await expect(page.getByTestId("affected-count")).toContainText("10 records affected");
    await page.screenshot({ path: "./.patchctl-results/demo/ten-proposed-updates.png", fullPage: true });
    await page.getByRole("button", { name: "Approve and apply", exact: true }).click();
    await expect(page.getByTestId("patch-state")).toHaveText("applied");
    const after = await rows();
    expect(after.slice(10)).toEqual(before.slice(10));
    for (const [index, record] of after.slice(0, 10).entries()) expect(record).toEqual({ ...before[index], summary_en: `Article ${index + 1} explains safe, human-reviewed content updates.` });
    const history = await cli(["history", proposal.id]);
    expect(history.events.map((event: any) => event.action)).toEqual(["prepared", "approved", "apply-attempt", "applied"]);
    expect(history.events.at(-1).details).toMatchObject({ reviewerId: session.userId, records: expect.any(Array) });
    for (const scenario of ["reject", "conflict"]) {
      const current = await cli(["read", session.sourceId, "--limit", "2"]);
      const next = await cli(["propose", "--stdin"], { sourceId: session.sourceId, schemaVersion: current.schemaVersion, reason: `Demo ${scenario}`,
        records: current.records.map((record: any) => ({ id: record.id, version: record.version, changes: { title: `Updated ${record.id}` } })) });
      if (scenario === "conflict") await pool.query(`UPDATE "${session.namespace}".articles SET body='Intervening human edit' WHERE id='02'`);
      const unchanged = await rows();
      await page.goto(next.reviewUrl);
      await page.getByRole("button", { name: scenario === "reject" ? "Reject patch" : "Approve and apply", exact: true }).click();
      await expect(page.getByTestId("patch-state")).toHaveText(scenario === "reject" ? "rejected" : "conflict");
      expect(await rows()).toEqual(unchanged);
    }
  } finally { await pool.end(); }
});
