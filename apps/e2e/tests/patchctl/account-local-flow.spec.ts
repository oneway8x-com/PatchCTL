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
      tenantName: z.string().nullable().optional(),
      roleId: z.string(),
    }),
  ),
});
const loginSchema = z.object({
  ok: z.literal(true),
  tenantId: z.string(),
  connectionId: z.string().uuid(),
  sourceId: z.string().uuid(),
  discoveredResources: z.number().int().nonnegative(),
  schemaVersion: z.string().regex(/^[a-f0-9]{64}$/),
  schemaChanged: z.boolean(),
  configurationUrl: z.string().url(),
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

test("a verification code can provision only one concurrent session", async ({
  request,
}) => {
  const session = sessionSchema.parse(
    JSON.parse(await readFile(process.env.PATCHCTL_DEMO_SESSION!, "utf8")),
  );
  requireDisposableDatabase(session.url, "PatchCTL metadata");

  const metadata = new Pool({ connectionString: session.url });
  const email = `account-replay-${randomUUID().replaceAll("-", "")}@example.test`;
  const otp = "739201";
  const otpHash = createHash("sha256").update(otp).digest("hex");
  let tenantId: string | undefined;

  try {
    const requested = await request.post("/api/auth/request-code", {
      data: { email },
    });
    expect(requested.status()).toBe(200);
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

    const responses = await Promise.all([
      request.post("/api/auth/verify-code", { data: { email, code: otp } }),
      request.post("/api/auth/verify-code", { data: { email, code: otp } }),
    ]);
    expect(responses.map((response) => response.status()).sort()).toEqual([
      200, 400,
    ]);

    const successful = responses.find((response) => response.status() === 200);
    expect(successful).toBeDefined();
    const signedIn = z
      .object({
        userId: z.string(),
        tenantId: z.string(),
        tenantName: z.string(),
        membershipId: z.string(),
      })
      .parse(await successful!.json());
    tenantId = signedIn.tenantId;

    const provisioned = await metadata.query<{
      tenantId: string;
      tenantName: string;
      systemKey: string;
      refreshTokenId: string;
    }>(
      `SELECT t."id" AS "tenantId", t."name" AS "tenantName",
              r."systemKey" AS "systemKey", rt."id" AS "refreshTokenId"
       FROM "User" u
       JOIN "Membership" m ON m."userId" = u."id"
       JOIN "Tenant" t ON t."id" = m."tenantId"
       JOIN "Role" r ON r."id" = m."roleId"
       JOIN "RefreshToken" rt ON rt."userId" = u."id"
       WHERE u."email" = $1`,
      [email],
    );
    expect(provisioned.rows).toHaveLength(1);
    expect(provisioned.rows[0]).toMatchObject({
      tenantId,
      tenantName: `${email.split("@")[0]}'s Tenant`,
      systemKey: "OWNER",
    });

    const consumed = await metadata.query(
      `SELECT "id" FROM "PortalOtpCode"
       WHERE "emailNormalized" = $1 AND "consumedAt" IS NOT NULL`,
      [email],
    );
    expect(consumed.rows).toHaveLength(1);
  } finally {
    if (tenantId) {
      await metadata.query(`DELETE FROM "RefreshToken" WHERE "tenantId" = $1`, [
        tenantId,
      ]);
      await metadata.query(`DELETE FROM "Membership" WHERE "tenantId" = $1`, [
        tenantId,
      ]);
      await metadata.query(`DELETE FROM "Role" WHERE "tenantId" = $1`, [
        tenantId,
      ]);
      await metadata.query(`DELETE FROM "Tenant" WHERE "id" = $1`, [tenantId]);
    }
    await metadata.query(`DELETE FROM "User" WHERE "email" = $1`, [email]);
    await metadata.query(
      `DELETE FROM "PortalOtpCode" WHERE "emailNormalized" = $1`,
      [email],
    );
    await metadata.end();
  }
});

test("a first login provisions one Tenant and connects the local CLI", async ({
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
  const expectedTenantName = `${email.split("@")[0]}'s Tenant`;
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

  let provisionedTenantId: string | undefined;
  try {
    await content.query(`CREATE SCHEMA "${namespace}"`);
    await content.query(
      `CREATE TYPE "${namespace}".article_status AS ENUM ('', ' pending ', 'a,b')`,
    );
    await content.query(
      `CREATE TABLE "${namespace}".articles (
        id integer PRIMARY KEY,
        title text NOT NULL,
        status "${namespace}".article_status NOT NULL DEFAULT ' pending ',
        private_note text NOT NULL
      )`,
    );
    await content.query(
      `INSERT INTO "${namespace}".articles (id, title, private_note) VALUES (1, 'Old title', 'never uploaded')`,
    );

    await signInWithFreshCode();
    const registered = await currentUser();
    expect(registered.email).toBe(email);
    const tenantId = registered.activeTenantId;
    if (!tenantId) {
      throw new Error(
        "First verified login did not provision an active Tenant",
      );
    }
    provisionedTenantId = tenantId;
    expect(registered.memberships).toHaveLength(1);
    expect(registered.memberships[0]).toMatchObject({
      tenantId,
      tenantName: expectedTenantName,
    });
    const roleId = registered.memberships[0]!.roleId;

    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Active Tenant" }),
    ).toBeVisible();
    await expect(
      page.getByText(expectedTenantName, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(tenantId, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Connect your local CLI" }),
    ).toBeVisible();

    const onboardingCommands = await page.locator("pre code").allTextContents();
    expect(onboardingCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining("pnpm patchctl connect postgres --tenant"),
        expect.stringContaining("pnpm patchctl login --server"),
        expect.stringContaining("pnpm patchctl submit"),
      ]),
    );
    expect(onboardingCommands.join("\n")).not.toContain("pct_");

    const provisioned = await metadata.query<{
      tenantId: string;
      tenantName: string;
      roleId: string;
      systemKey: string;
    }>(
      `SELECT t."id" AS "tenantId", t."name" AS "tenantName",
              r."id" AS "roleId", r."systemKey" AS "systemKey"
       FROM "User" u
       JOIN "Membership" m ON m."userId" = u."id"
       JOIN "Tenant" t ON t."id" = m."tenantId"
       JOIN "Role" r ON r."id" = m."roleId"
       WHERE u."email" = $1`,
      [email],
    );
    expect(provisioned.rows).toEqual([
      { tenantId, tenantName: expectedTenantName, roleId, systemKey: "OWNER" },
    ]);

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
    const reused = await currentUser();
    expect(reused.activeTenantId).toBe(tenantId);
    expect(reused.memberships).toEqual([
      expect.objectContaining({
        tenantId,
        tenantName: expectedTenantName,
        roleId,
      }),
    ]);
    const stillProvisioned = await metadata.query(
      `SELECT m."id"
       FROM "Membership" m
       JOIN "User" u ON u."id" = m."userId"
       WHERE u."email" = $1`,
      [email],
    );
    expect(stillProvisioned.rows).toHaveLength(1);

    await page.getByRole("button", { name: "Create client token" }).click();
    const tokenInput = page.getByLabel(
      "Copy this token now; it is shown only in this session",
    );
    await expect(tokenInput).toBeVisible();
    const clientToken = await tokenInput.inputValue();
    await page.getByRole("button", { name: "Hide token" }).click();
    expect(clientToken).toMatch(/^pct_[A-Za-z0-9_-]{32,128}$/);
    expect(
      (await page.locator("pre code").allTextContents()).join("\n"),
    ).not.toContain(clientToken);

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
    expect(connected.sourceId).toBe(connected.connectionId);
    expect(connected.discoveredResources).toBeGreaterThan(0);
    expect(connected.schemaChanged).toBe(true);

    const metadataResponse = await request.get(
      `/api/patchctl/sources/${connected.sourceId}/metadata`,
      { headers: { Authorization: `Bearer ${clientToken}` } },
    );
    expect(metadataResponse.status()).toBe(200);
    const metadataBody = await metadataResponse.text();
    expect(metadataBody).toContain(`${namespace}.articles`);
    expect(metadataBody).toContain("private_note");
    expect(metadataBody).not.toContain("never uploaded");
    expect(metadataBody).not.toContain(contentUrl);
    expect(metadataBody).not.toContain(clientToken);
    const storedSource = await metadata.query<{
      tenantId: string;
      providerKey: string;
      authMethod: string;
      secretEncrypted: string | null;
      configJson: unknown;
    }>(
      `SELECT "tenantId", "providerKey", "authMethod", "secretEncrypted", "configJson"
       FROM "IntegrationConnection" WHERE "id" = $1`,
      [connected.sourceId],
    );
    expect(storedSource.rows).toHaveLength(1);
    expect(storedSource.rows[0]).toMatchObject({
      tenantId,
      providerKey: "patchctl.local-postgres",
      authMethod: "local-client",
      secretEncrypted: null,
    });
    const storedDocument = JSON.stringify(storedSource.rows[0]!.configJson);
    expect(storedDocument).toContain(`${namespace}.articles`);
    expect(storedDocument).not.toContain(contentUrl);
    expect(storedDocument).not.toContain("never uploaded");

    await page.goto(connected.configurationUrl);
    await expect(
      page.getByRole("heading", { name: cliTenant, exact: true }),
    ).toBeVisible();
    const resourceConfiguration = page.getByTestId(
      `source-resource-${namespace}.articles`,
    );
    await resourceConfiguration
      .getByLabel(`Managed resource ${namespace}.articles`)
      .check();
    const titleField = resourceConfiguration
      .getByRole("row")
      .filter({ hasText: "title" });
    await titleField.getByLabel(`${namespace}.articles title writable`).check();
    const statusField = resourceConfiguration
      .getByRole("row")
      .filter({ hasText: "status" });
    await expect(
      statusField.getByLabel(`Enum value 1 for ${namespace}.articles status`, {
        exact: true,
      }),
    ).toHaveValue("");
    await expect(
      statusField.getByLabel(`Enum value 2 for ${namespace}.articles status`, {
        exact: true,
      }),
    ).toHaveValue(" pending ");
    await expect(
      statusField.getByLabel(`Enum value 3 for ${namespace}.articles status`, {
        exact: true,
      }),
    ).toHaveValue("a,b");
    await statusField
      .getByLabel(`Enum value 2 for ${namespace}.articles status`, {
        exact: true,
      })
      .fill(" changed ");
    await page.getByRole("button", { name: "Save configuration" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Source configuration saved.",
    );
    const configuredSource = await metadata.query<{ configJson: unknown }>(
      `SELECT "configJson" FROM "IntegrationConnection" WHERE "id" = $1`,
      [connected.sourceId],
    );
    expect(configuredSource.rows[0]?.configJson).toMatchObject({
      configuration: {
        resources: expect.arrayContaining([
          expect.objectContaining({
            name: `${namespace}.articles`,
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: "status",
                enumValues: ["", " changed ", "a,b"],
              }),
            ]),
          }),
        ]),
      },
    });

    expect(await cli(["schema"], clientToken)).toMatchObject({
      schemaSynced: false,
      schemaVersion: connected.schemaVersion,
      resources: [
        {
          name: `${namespace}.articles`,
          fields: expect.arrayContaining([
            expect.objectContaining({ name: "id", readonly: true }),
            expect.objectContaining({ name: "title", readonly: false }),
          ]),
        },
      ],
    });

    await cli(["patch", "start", "--title", "Account E2E title update"]);
    await cli(
      ["update", "articles", "1", "--set", "title=New title"],
      clientToken,
    );
    expect(await cli(["diff"])).toMatchObject({
      operations: [
        {
          resource: `${namespace}.articles`,
          recordId: "1",
          changes: { title: { before: "Old title", after: "New title" } },
        },
      ],
    });
    expect(await cli(["validate"], clientToken)).toMatchObject({
      valid: true,
      errors: [],
    });

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
    if (provisionedTenantId) {
      await metadata.query(
        `DELETE FROM "LocalContentPatch" WHERE "tenantId" = $1`,
        [provisionedTenantId],
      );
      await metadata.query(`DELETE FROM "ApiKey" WHERE "tenantId" = $1`, [
        provisionedTenantId,
      ]);
      await metadata.query(`DELETE FROM "Membership" WHERE "tenantId" = $1`, [
        provisionedTenantId,
      ]);
      await metadata.query(`DELETE FROM "Role" WHERE "tenantId" = $1`, [
        provisionedTenantId,
      ]);
    }
    await metadata.query(
      `DELETE FROM "RefreshToken" WHERE "userId" IN (
      SELECT "id" FROM "User" WHERE "email" = $1
    )`,
      [email],
    );
    if (provisionedTenantId) {
      await metadata.query(`DELETE FROM "Tenant" WHERE "id" = $1`, [
        provisionedTenantId,
      ]);
    }
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
