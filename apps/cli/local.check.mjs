import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { runLocal } from "./dist/local/commands.js";
import { runPatchCommand } from "./dist/local/patch-commands.js";
import { inferField, quoteIdentifier, withDatabase } from "@patchctl/postgres";
import { readConfig, writeConfig } from "./dist/local/config.js";
import {
  databaseCredential,
  NativeCredentialStore,
} from "./dist/local/credentials.js";

test("PostgreSQL field mapping keeps unsupported/generated/primary fields readonly", () => {
  const column = {
    name: "value",
    pg_type: "text",
    kind: "b",
    nullable: true,
    generated: false,
    primary: false,
    enum_values: null,
    relation_schema: null,
    relation_table: null,
    relation_column: null,
  };
  for (const [pg_type, type] of [
    ["text", "text"],
    ["varchar", "string"],
    ["int4", "number"],
    ["numeric", "number"],
    ["bool", "boolean"],
    ["timestamp", "datetime"],
    ["date", "date"],
    ["jsonb", "unsupported"],
    ["_text", "unsupported"],
  ]) {
    const field = inferField({ ...column, pg_type });
    assert.equal(field.type, type);
    assert.equal(field.readonly, type === "unsupported");
  }
  assert.equal(inferField({ ...column, primary: true }).readonly, true);
  assert.equal(inferField({ ...column, generated: true }).readonly, true);
  assert.deepEqual(
    inferField({ ...column, kind: "e", enum_values: ["DRAFT", "PUBLISHED"] })
      .enumValues,
    ["DRAFT", "PUBLISHED"],
  );
  assert.equal(
    inferField({
      ...column,
      relation_schema: "public",
      relation_table: "categories",
      relation_column: "id",
    }).type,
    "relation",
  );
  assert.equal(
    quoteIdentifier('a"; DROP TABLE articles;--'),
    '"a""; DROP TABLE articles;--"',
  );
});

test("configuration rejects secrets and invalid tenant keys before writing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "patchctl-config-test-"));
  try {
    await writeConfig(directory, {
      currentTenant: "demo",
      tenants: { demo: { resources: [] } },
    });
    const before = await readFile(join(directory, "config.json"), "utf8");
    await assert.rejects(
      writeConfig(directory, { tenants: {}, databaseUrl: "secret-canary" }),
      { code: "INVALID_CONFIG" },
    );
    await assert.rejects(
      writeConfig(directory, { currentTenant: "__proto__", tenants: {} }),
      { code: "INVALID_CONFIG" },
    );
    assert.equal(
      await readFile(join(directory, "config.json"), "utf8"),
      before,
    );
    assert.ok(!before.includes("secret-canary"));
    assert.equal((await readConfig(directory)).currentTenant, "demo");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("environment fallback is explicit and never writes to the credential store", async () => {
  const store = {
    get: async () => {
      throw Error("not expected");
    },
  };
  const result = await databaseCredential("demo", store, {
    PATCHCTL_DATABASE_URL: "secret-canary",
  });
  assert.equal(result.secret, "secret-canary");
  assert.equal(result.warnings.length, 1);
  await assert.rejects(
    databaseCredential("demo", { get: async () => null }, {}),
    { code: "CREDENTIAL_NOT_FOUND" },
  );
});

test("database failures never include connection strings or raw exception text", async () => {
  await assert.rejects(
    withDatabase("secret-canary", async () => {}),
    (error) => {
      assert.equal(error.code, "DATABASE_UNAVAILABLE");
      assert.ok(!error.message.includes("secret-canary"));
      return true;
    },
  );
});

test(
  "native credential store round trip",
  { skip: !process.env.PATCHCTL_TEST_KEYRING },
  async () => {
    const store = new NativeCredentialStore();
    const key = `test-${crypto.randomUUID()}/database`;
    try {
      assert.equal(await store.get(key), null);
      await store.set(key, "synthetic-keyring-test-value");
      assert.equal(await store.get(key), "synthetic-keyring-test-value");
      await store.delete(key);
      assert.equal(await store.get(key), null);
    } finally {
      await store.delete(key);
    }
  },
);

test(
  "local CLI connects, explicitly selects resources/columns, and reads PostgreSQL without an HTTP request",
  { skip: !process.env.PATCHCTL_LOCAL_TEST_DATABASE_URL },
  async () => {
    const databaseUrl = process.env.PATCHCTL_LOCAL_TEST_DATABASE_URL;
    const url = new URL(databaseUrl);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    assert.ok(url.pathname.endsWith("_test"));
    const directory = await mkdtemp(join(tmpdir(), "patchctl-local-test-"));
    const schema = `foundation_${crypto.randomUUID().replaceAll("-", "")}`;
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const q = quoteIdentifier(schema);
    const values = new Map();
    const credentials = {
      set: async (k, v) => {
        values.set(k, v);
      },
      get: async (k) => values.get(k) ?? null,
      delete: async (k) => {
        values.delete(k);
      },
    };
    const invoke = async (args) => {
      let output = "",
        errors = "";
      const execute = ["patch", "update", "diff", "validate"].includes(args[0])
        ? runPatchCommand
        : runLocal;
      const code = await execute(args, {
        env: { PATCHCTL_HOME: directory },
        credentials,
        promptSecret: async () => databaseUrl,
        stdout: {
          write: (value) => {
            output += value;
          },
        },
        stderr: {
          write: (value) => {
            errors += value;
          },
        },
      });
      assert.ok(!output.includes(databaseUrl));
      assert.ok(!errors.includes(databaseUrl));
      return {
        code,
        output: output ? JSON.parse(output) : undefined,
        error: errors ? JSON.parse(errors).error : undefined,
      };
    };
    try {
      await client.query(`CREATE SCHEMA ${q}`);
      await client.query(
        `CREATE TYPE ${q}.article_status AS ENUM ('DRAFT','PUBLISHED')`,
      );
      await client.query(
        `CREATE TABLE ${q}.categories (id uuid PRIMARY KEY, name text NOT NULL)`,
      );
      await client.query(
        `CREATE TABLE ${q}.articles (id integer PRIMARY KEY, title text NOT NULL, status ${q}.article_status NOT NULL DEFAULT 'DRAFT', category_id uuid REFERENCES ${q}.categories(id), count numeric, enabled boolean, published_at timestamptz, secret_note text, payload jsonb)`,
      );
      await client.query(
        `INSERT INTO ${q}.articles (id,title,count,secret_note) VALUES (1,'Old title',12345678901234567890.1234,'unselected-secret')`,
      );
      assert.equal(
        (await invoke(["connect", "--tenant", "demo", "--json"])).code,
        0,
      );
      assert.equal(values.get("demo/database"), databaseUrl);
      assert.ok(
        !(await readFile(join(directory, "config.json"), "utf8")).includes(
          databaseUrl,
        ),
      );
      assert.deepEqual(
        (await invoke(["resources", "--json"])).output.resources,
        [],
      );
      assert.equal(
        (await invoke(["get", `${schema}.articles`, "1", "--json"])).error.code,
        "RESOURCE_NOT_FOUND",
      );
      assert.equal(
        (await invoke(["init", "--json"])).error.code,
        "RESOURCE_SELECTION_REQUIRED",
      );
      assert.equal(
        (
          await invoke([
            "init",
            "--resources",
            `${schema}.articles`,
            "--columns",
            "title",
            "--json",
          ])
        ).error.code,
        "UNSUPPORTED_PRIMARY_KEY",
      );
      assert.equal(
        (
          await invoke([
            "init",
            "--resources",
            `${schema}.articles`,
            "--columns",
            "id,title,count,status,category_id,enabled,published_at,payload",
            "--json",
          ])
        ).code,
        0,
      );
      const resource = (await invoke(["schema", "articles", "--json"])).output
        .resource;
      assert.equal(resource.primaryKey, "id");
      assert.equal(
        resource.fields.find((f) => f.name === "payload").readonly,
        true,
      );
      assert.equal(
        resource.fields.find((f) => f.name === "category_id").type,
        "relation",
      );
      assert.equal(
        resource.fields.some((f) => f.name === "secret_note"),
        false,
      );
      const get = await invoke(["get", "articles", "1", "--json"]);
      assert.equal(get.output.record.title, "Old title");
      assert.equal(get.output.record.count, "12345678901234567890.1234");
      assert.equal(Object.hasOwn(get.output.record, "secret_note"), false);
      assert.equal(Object.hasOwn(get.output.record, "payload"), false);
      assert.equal(
        (await invoke(["list", "articles", "--limit", "2", "--json"])).output
          .records.length,
        1,
      );
      assert.equal(
        (await invoke(["list", "articles", "--limit", "NaN", "--json"])).error
          .code,
        "INVALID_VALUE",
      );
      assert.equal(
        (await invoke(["get", "articles", "999", "--json"])).error.code,
        "RECORD_NOT_FOUND",
      );
      assert.equal(
        (await invoke(["update", "articles", "1", "--set", "title=New title"]))
          .error.code,
        "NO_ACTIVE_PATCH",
      );
      assert.equal(
        (await invoke(["patch", "start", "--title", "Improve title"])).code,
        0,
      );
      assert.equal(
        (await invoke(["patch", "start"])).error.code,
        "PATCH_ALREADY_ACTIVE",
      );
      assert.equal(
        (await invoke(["update", "articles", "1", "--set", "id=2"])).error.code,
        "FIELD_READONLY",
      );
      assert.equal(
        (await invoke(["update", "articles", "1", "--set", "unknown=value"]))
          .error.code,
        "FIELD_NOT_FOUND",
      );
      assert.equal(
        (await invoke(["update", "articles", "1", "--set", "status=LIVE"]))
          .error.code,
        "INVALID_ENUM_VALUE",
      );
      assert.equal(
        (await invoke(["update", "articles", "1", "--set", "title=null"])).error
          .code,
        "INVALID_VALUE",
      );
      const draftFile = join(directory, "demo-draft.json");
      const originalDraft = await readFile(draftFile, "utf8");
      const dryRun = await invoke([
        "update",
        "articles",
        "1",
        "--set",
        "title=Dry run",
        "--dry-run",
      ]);
      assert.equal(dryRun.code, 0);
      assert.equal(dryRun.output.operation.before.title, "Old title");
      assert.equal(dryRun.output.operation.after.title, "Dry run");
      assert.equal(await readFile(draftFile, "utf8"), originalDraft);
      assert.equal(
        (await invoke(["update", "articles", "1", "--set", "title=New title"]))
          .code,
        0,
      );
      assert.equal(
        (
          await invoke([
            "update",
            "articles",
            "1",
            "--set",
            "title=Final title",
          ])
        ).code,
        0,
      );
      const diff = await invoke(["diff"]);
      assert.deepEqual(diff.output.operations[0].changes.title, {
        before: "Old title",
        after: "Final title",
      });
      assert.equal(diff.output.operations.length, 1);
      assert.equal(
        (await invoke(["get", "articles", "1"])).output.record.title,
        "Old title",
      );
      assert.equal((await invoke(["validate"])).output.valid, true);
      assert.ok(
        !(await readFile(draftFile, "utf8")).includes("unselected-secret"),
      );
      await client.query(
        `UPDATE ${q}.articles SET secret_note='unselected change' WHERE id=1`,
      );
      const conflict = await invoke(["validate"]);
      assert.equal(conflict.code, 1);
      assert.equal(conflict.output.errors[0].code, "PATCH_CONFLICT");
      assert.equal(
        (await invoke(["update", "articles", "1", "--set", "title=Stale"]))
          .error.code,
        "PATCH_CONFLICT",
      );
      await client.query(`ALTER TABLE ${q}.articles DROP COLUMN title`);
      assert.equal(
        (await invoke(["get", "articles", "1", "--json"])).error.code,
        "SCHEMA_CHANGED",
      );
    } finally {
      await client.query(`DROP SCHEMA ${q} CASCADE`);
      await client.end();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
