import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  localAgentEnv,
  localAppPort,
  localAppUrl,
  localDatabaseEnv,
  localDatabaseUrl,
  localDemoServerEnv,
  resolveLocalSessionPath,
  validateLocalSession,
} from "./patchctl-local-config.mjs";

test("local agent launches apps/cli and forwards help and stdin validation", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "patchctl-launcher-"));
  try {
    await mkdir(resolve(fixture, "scripts"));
    await mkdir(resolve(fixture, "apps/cli/dist"), { recursive: true });
    await mkdir(resolve(fixture, ".patchctl-demo"));
    for (const script of ["patchctl-local.mjs", "patchctl-local-config.mjs"])
      await copyFile(
        new URL(script, import.meta.url),
        resolve(fixture, "scripts", script),
      );
    // Copy all compiled modules: symlinking the entrypoint changes its main-module identity.
    await cp(
      new URL("../apps/cli/dist/", import.meta.url),
      resolve(fixture, "apps/cli/dist"),
      { recursive: true },
    );
    await copyFile(
      new URL("../apps/cli/package.json", import.meta.url),
      resolve(fixture, "apps/cli/package.json"),
    );
    // Reuse installed dependencies without requiring an install in the disposable fixture.
    await symlink(
      fileURLToPath(new URL("../apps/cli/node_modules", import.meta.url)),
      resolve(fixture, "apps/cli/node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await writeFile(
      resolve(fixture, ".patchctl-demo/local.json"),
      JSON.stringify({ sessionPath: ".patchctl-demo/session.json" }),
    );
    await writeFile(
      resolve(fixture, ".patchctl-demo/session.json"),
      JSON.stringify({
        url: localDatabaseUrl,
        tenantId: "tenant",
        userId: "user",
        sourceId: "source",
        jwtSecret: "unused-fixture-secret",
        agentToken: "unused-fixture-agent",
        humanToken: "unused-fixture-human",
      }),
    );
    const invoke = (args, input) =>
      spawnSync(
        process.execPath,
        [resolve(fixture, "scripts/patchctl-local.mjs"), "agent", ...args],
        {
          cwd: tmpdir(), // The launcher must resolve its own root, not the caller's cwd.
          input,
          encoding: "utf8",
          windowsHide: true,
          timeout: 10000,
        },
      );
    const help = invoke(["--", "--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(
      help.stdout,
      /patchctl.*prepare content changes for human review/,
    );
    const validation = invoke(
      ["server", "validate", "--stdin"],
      JSON.stringify({
        sourceId: "e1bf2bb3-d983-4a69-b387-1f93124c1a24",
        schemaVersion: "a".repeat(64),
        reason: "Fix typo",
        records: [
          { id: "1", version: "b".repeat(32), changes: { title: "Fixed" } },
        ],
      }),
    );
    assert.equal(validation.status, 0, validation.stderr);
    assert.deepEqual(JSON.parse(validation.stdout), {
      valid: true,
      validation: "local-structure-only",
      affectedRecords: 1,
    });
    assert.equal(validation.stderr, "");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("demo server rejects unsafe ports before reading credentials or starting Next", () => {
  for (const port of ["0", "80", "65536", "3109x", ""]) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./patchctl-demo-server.mjs", import.meta.url))],
      {
        env: {
          ...process.env,
          PATCHCTL_DEMO_PORT: port,
          PATCHCTL_DEMO_SESSION: "must-not-be-read.json",
        },
        encoding: "utf8",
        windowsHide: true,
        timeout: 5000,
      },
    );
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /PATCHCTL_DEMO_PORT must be an unprivileged TCP port/,
    );
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});

test("local setup overrides both Prisma targets without mutating the caller", () => {
  const original = {
    DATABASE_URL: "postgresql://remote/prod",
    DIRECT_DATABASE_URL: "postgresql://remote/prod",
    NODE_ENV: "production",
    NEXT_PUBLIC_API_BASE_URL: "https://remote.example.test",
    KEEP: "value",
  };
  const env = localDatabaseEnv(original);
  assert.equal(env.DATABASE_URL, localDatabaseUrl);
  assert.equal(env.DIRECT_DATABASE_URL, localDatabaseUrl);
  assert.equal(env.PATCHCTL_TEST_DATABASE_URL, localDatabaseUrl);
  assert.equal(env.DOCKER_CONTAINER, "1");
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.NEXT_PUBLIC_API_BASE_URL, "");
  assert.equal(env.KEEP, "value");
  assert.equal(original.DATABASE_URL, "postgresql://remote/prod");
  assert.equal(original.NODE_ENV, "production");
});

test("demo server and agent environments keep compatibility narrowly scoped", () => {
  const root = resolve("local-fixture");
  const inherited = {
    DATABASE_URL: "postgresql://remote/prod",
    DIRECT_DATABASE_URL: "postgresql://remote/prod",
    PATCHCTL_TEST_DATABASE_URL: "postgresql://remote/test",
    JWT_SECRET: "must-not-reach-agent",
    PATCHCTL_SOURCE_SECRETS: "must-not-reach-agent",
    PATCHCTL_DEMO_SESSION: "must-not-reach-agent",
    PATCHCTL_LEGACY_SERVER_CONTENT: "0",
    PATCHCTL_HOME: "/user/config",
    KEEP: "value",
  };

  const serverEnv = localDemoServerEnv(inherited, "/demo/session.json");
  assert.equal(serverEnv.DATABASE_URL, localDatabaseUrl);
  assert.equal(serverEnv.DIRECT_DATABASE_URL, localDatabaseUrl);
  assert.equal(serverEnv.PATCHCTL_DEMO_SESSION, "/demo/session.json");
  assert.equal(serverEnv.PATCHCTL_DEMO_PORT, String(localAppPort));
  assert.equal(serverEnv.PATCHCTL_LEGACY_SERVER_CONTENT, "1");

  const agentEnv = localAgentEnv(inherited, root, "scoped-agent-token");
  assert.equal(agentEnv.PATCHCTL_URL, localAppUrl);
  assert.equal(agentEnv.PATCHCTL_TOKEN, "scoped-agent-token");
  assert.equal(
    agentEnv.PATCHCTL_HOME,
    resolve(root, ".patchctl-demo", "agent-cli"),
  );
  assert.equal(agentEnv.KEEP, "value");
  for (const key of [
    "DATABASE_URL",
    "DIRECT_DATABASE_URL",
    "PATCHCTL_TEST_DATABASE_URL",
    "JWT_SECRET",
    "PATCHCTL_SOURCE_SECRETS",
    "PATCHCTL_DEMO_SESSION",
    "PATCHCTL_LEGACY_SERVER_CONTENT",
  ])
    assert.equal(Object.hasOwn(agentEnv, key), false, key);
});

test("session pointer must remain in the private demo directory", () => {
  const root = resolve("local-fixture");
  assert.equal(
    resolveLocalSessionPath(root, ".patchctl-demo/tenant/session.json"),
    resolve(root, ".patchctl-demo/tenant/session.json"),
  );
  for (const input of [
    undefined,
    "../session.json",
    ".patchctl-demo",
    ".patchctl-demo/../session.json",
    ".patchctl-demo-other/session.json",
  ])
    assert.throws(() => resolveLocalSessionPath(root, input));
});

test("local launcher rejects remote and unrelated local database sessions", () => {
  const session = {
    url: localDatabaseUrl,
    tenantId: "tenant",
    userId: "user",
    sourceId: "source",
    jwtSecret: "fixture-only",
    agentToken: "fixture-only",
    humanToken: "fixture-only",
  };
  assert.equal(validateLocalSession(session), session);
  for (const url of [
    "postgresql://remote/patchctl_demo",
    "postgresql://127.0.0.1:5434/corely",
    undefined,
  ])
    assert.throws(() => validateLocalSession({ ...session, url }));
  assert.throws(() => validateLocalSession({ ...session, agentToken: "" }));
  assert.throws(() => validateLocalSession(null));
});
