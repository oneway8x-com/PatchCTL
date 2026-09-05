import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  localDatabaseEnv,
  localDatabaseUrl,
  resolveLocalSessionPath,
  validateLocalSession,
} from "./patchctl-local-config.mjs";

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
    KEEP: "value",
  };
  const env = localDatabaseEnv(original);
  assert.equal(env.DATABASE_URL, localDatabaseUrl);
  assert.equal(env.DIRECT_DATABASE_URL, localDatabaseUrl);
  assert.equal(env.PATCHCTL_TEST_DATABASE_URL, localDatabaseUrl);
  assert.equal(env.DOCKER_CONTAINER, "1");
  assert.equal(env.KEEP, "value");
  assert.equal(original.DATABASE_URL, "postgresql://remote/prod");
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
