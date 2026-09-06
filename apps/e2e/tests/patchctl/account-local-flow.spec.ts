import { expect, test } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { z } from "zod";

const sessionSchema = z.object({ url: z.string().url() });
const currentUserSchema = z.object({
  userId: z.string(),
  email: z.string(),
  activeTenantId: z.string().nullable().optional(),
  memberships: z.array(
    z.object({
      tenantId: z.string().nullable().optional(),
      roleId: z.string(),
    }),
  ),
});
const loginSchema = z.object({
  ok: z.literal(true),
  tenantId: z.string(),
  connectionId: z.string().uuid(),
});
const submissionSchema = z.object({
  patchId: z.string(),
  revision: z.string(),
  reviewUrl: z.string().url(),
});

function requireDisposableDatabase(url: string, name: string) {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
    !/_(test|demo)$/.test(database)
  ) {
    throw new Error(
      `${name} must be a disposable loopback _test or _demo database.`,
    );
  }
}

test("a registered and activated account connects the local CLI and reviews its patch", async ({
  page,
  request,
}) => {
  const session = sessionSchema.parse(
    JSON.parse(await readFile(process.env.PATCHCTL_DEMO_SESSION!, "utf8")),
  );
  const contentUrl =
    process.env.PATCHCTL_CONTENT_TEST_DATABASE_URL ??
    process.env.PATCHCTL_LOCAL_TEST_DATABASE_URL!;
  requireDisposableDatabase(session.url, "PatchCTL metadata");
  requireDisposableDatabase(contentUrl, "PatchCTL content");

  const suffix = randomUUID().replaceAll("-", "");
  const email = `account-e2e-${suffix}@example.test`;
  const tenantId = randomUUID();
  const tenantName = `Account E2E ${suffix.slice(0, 8)}`;
  const tenantSlug = `account-e2e-${suffix}`;
  const roleId = randomUUID();
  const membershipId = randomUUID();
  const cliTenant = `account_${suffix.slice(0, 16)}`;
  const namespace = `account_${suffix}`;
  const otp = "739201";
  const otpHash = createHash("sha256").update(otp).digest("hex");
  const home = await mkdtemp(join(tmpdir(), "patchctl-account-e2e-"));
  const metadata = new Pool({ connectionString: session.url });
  const content = new Pool({ connectionString: contentUrl });

  async function signInWithFreshCode() {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Continue with email" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible();

    const updated = await metadata.query(
      `UPDATE "PortalOtpCode"
       SET "codeHash" = $2, "expiresAt" = NOW() + INTERVAL '15 minutes',
           "attemptCount" = 0, "updatedAt" = NOW()
       WHERE "id" = (
         SELECT "id" FROM "PortalOtpCode"
         WHERE "emailNormalized" = $1 AND "consumedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 1
       )
       RETURNING "id"`,
      [email, otpHash],
    );
    expect(updated.rowCount).toBe(1);

    await page.getByLabel("6-digit code").fill(otp);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard"),
      page.getByRole("button", { name: "Continue", exact: true }).click(),
    ]);
  }

  async function browserTokens() {
    return page.evaluate(() => ({
      accessToken: localStorage.getItem("accessToken"),
      refreshToken: localStorage.getItem("refreshToken"),
    }));
  }

  async function currentUser() {
    const { accessToken } = await browserTokens();
    expect(accessToken).toBeTruthy();
    const response = await request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.status()).toBe(200);
    return currentUserSchema.parse(await response.json());
  }

  async function cli(args: string[], clientToken?: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TZ: process.env.TZ,
        PATCHCTL_HOME: home,
        PATCHCTL_DATABASE_URL: contentUrl,
      };
      if (clientToken) env.PATCHCTL_TOKEN = clientToken;
      else delete env.PATCHCTL_TOKEN;
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../../../cli/dist/cli.js", import.meta.url)),
          ...args,
          "--json",
        ],
        { windowsHide: true, stdio: "pipe", env },
      );
      let output = "";
      let errors = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        errors += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`CLI ${args[0]} failed: ${errors || output}`));
          return;
        }
        resolve(JSON.parse(output));
      });
      child.stdin.end();
    });
  }

  try {
    await content.query(`CREATE SCHEMA "${namespace}"`);
    await content.query(
      `CREATE TABLE "${namespace}".articles (
        id integer PRIMARY KEY,
        title text NOT NULL,
        private_note text NOT NULL
      )`,
    );
    await content.query(
      `INSERT INTO "${namespace}".articles VALUES (1, 'Old title', 'never uploaded')`,
    );

    await signInWithFreshCode();
    const registered = await currentUser();
    expect(registered).toMatchObject({
      email,
      activeTenantId: null,
      memberships: [],
    });

    await page.goto("/patches");
    await expect(
      page.getByRole("alert").filter({ hasText: "Patch data is unavailable" }),
    ).toContainText("Tenant access");
    await expect(
      page.getByRole("button", { name: "Create client token" }),
    ).toHaveCount(0);

    const user = await metadata.query<{ id: string }>(
      `SELECT "id" FROM "User" WHERE "email" = $1`,
      [email],
    );
    expect(user.rows).toHaveLength(1);
    expect(user.rows[0]?.id).toBe(registered.userId);

    const operator = await metadata.connect();
    try {
      await operator.query("BEGIN");
      await operator.query(
        `INSERT INTO "Tenant" ("id", "name", "slug", "status")
         VALUES ($1, $2, $3, 'ACTIVE')`,
        [tenantId, tenantName, tenantSlug],
      );
      await operator.query(
        `INSERT INTO "Role"
          ("id", "tenantId", "name", "scope", "systemKey", "isSystem", "updatedAt")
         VALUES ($1, $2, 'Account E2E administrator', 'TENANT', 'ADMIN', true, NOW())`,
        [roleId, tenantId],
      );
      await operator.query(
        `INSERT INTO "Membership" ("id", "tenantId", "userId", "roleId")
         VALUES ($1, $2, $3, $4)`,
        [membershipId, tenantId, registered.userId, roleId],
      );
      await operator.query("COMMIT");
    } catch (error) {
      await operator.query("ROLLBACK");
      throw error;
    } finally {
      operator.release();
    }

    const oldSession = await browserTokens();
    expect(oldSession.accessToken).toBeTruthy();
    expect(oldSession.refreshToken).toBeTruthy();
    const logout = await request.post("/api/auth/logout", {
      headers: { Authorization: `Bearer ${oldSession.accessToken}` },
      data: { refreshToken: oldSession.refreshToken },
    });
    expect(logout.status()).toBe(204);
    await page.evaluate(() => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("activeWorkspaceId");
    });

    await signInWithFreshCode();
    const activated = await currentUser();
    expect(activated.activeTenantId).toBe(tenantId);
    expect(activated.memberships).toContainEqual(
      expect.objectContaining({ tenantId, roleId }),
    );

    await page.goto("/patches");
    await expect(
      page.getByRole("heading", { name: "Connect your local client" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create client token" }).click();
    const tokenInput = page.getByLabel(
      "Copy this token now; it is shown only in this session",
    );
    await expect(tokenInput).toBeVisible();
    const clientToken = await tokenInput.inputValue();
    await page.getByRole("button", { name: "Hide token" }).click();
    expect(clientToken).toMatch(/^pct_[A-Za-z0-9_-]{32,128}$/);

    expect(
      await cli(["connect", "postgres", "--tenant", cliTenant]),
    ).toMatchObject({ ok: true, credentialStorage: "environment" });
    await cli([
      "init",
      "--resources",
      `${namespace}.articles`,
      "--columns",
      "id,title",
    ]);
    const connected = loginSchema.parse(
      await cli(["login", "--server", "http://127.0.0.1:3110"], clientToken),
    );
    expect(connected.tenantId).toBe(tenantId);

    await cli(["patch", "start", "--title", "Account E2E title update"]);
    await cli(["update", "articles", "1", "--set", "title=New title"]);
    expect(await cli(["diff"])).toMatchObject({
      operations: [
        {
          resource: `${namespace}.articles`,
          recordId: "1",
          changes: { title: { before: "Old title", after: "New title" } },
        },
      ],
    });
    expect(await cli(["validate"])).toMatchObject({ valid: true, errors: [] });

    const proposal = submissionSchema.parse(await cli(["submit"], clientToken));
    expect(await cli(["submit"], clientToken)).toMatchObject({
      patchId: proposal.patchId,
      revision: proposal.revision,
    });
    expect(
      (
        await content.query(
          `SELECT title FROM "${namespace}".articles WHERE id = 1`,
        )
      ).rows[0]?.title,
    ).toBe("Old title");

    const submitted = await request.get(
      `/api/patchctl/local-patches/${proposal.patchId}`,
      { headers: { Authorization: `Bearer ${clientToken}` } },
    );
    expect(submitted.status()).toBe(200);
    const body = await submitted.text();
    expect(body).not.toContain("never uploaded");
    expect(body).not.toContain(contentUrl);

    const denied = await request.post(
      `/api/patchctl/local-patches/${proposal.patchId}/decision`,
      {
        headers: { Authorization: `Bearer ${clientToken}` },
        data: { revision: proposal.revision, decision: "APPROVED" },
      },
    );
    expect(denied.status()).toBe(403);

    await page.goto(proposal.reviewUrl);
    await expect(page.getByTestId("record-diff")).toContainText("Old title");
    await expect(page.getByTestId("record-diff")).toContainText("New title");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByTestId("patch-state")).toHaveText("APPROVED");
    expect(
      (
        await content.query(
          `SELECT title FROM "${namespace}".articles WHERE id = 1`,
        )
      ).rows[0]?.title,
    ).toBe("Old title");
  } finally {
    await content.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await metadata.query(
      `DELETE FROM "LocalContentPatch" WHERE "tenantId" = $1`,
      [tenantId],
    );
    await metadata.query(`DELETE FROM "ApiKey" WHERE "tenantId" = $1`, [
      tenantId,
    ]);
    await metadata.query(`DELETE FROM "Membership" WHERE "tenantId" = $1`, [
      tenantId,
    ]);
    await metadata.query(`DELETE FROM "Role" WHERE "tenantId" = $1`, [
      tenantId,
    ]);
    await metadata.query(
      `DELETE FROM "RefreshToken" WHERE "userId" IN (
      SELECT "id" FROM "User" WHERE "email" = $1
    )`,
      [email],
    );
    await metadata.query(`DELETE FROM "Tenant" WHERE "id" = $1`, [tenantId]);
    await metadata.query(`DELETE FROM "User" WHERE "email" = $1`, [email]);
    await metadata.query(
      `DELETE FROM "PortalOtpCode" WHERE "emailNormalized" = $1`,
      [email],
    );
    await content.end();
    await metadata.end();
    await rm(home, { recursive: true, force: true });
  }
});
