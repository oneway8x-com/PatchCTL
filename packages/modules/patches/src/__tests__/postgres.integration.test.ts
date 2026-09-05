import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresProbe } from "../postgres";
import { PostgresSchemaInspector } from "../schema.postgres";
import { contentSchemaInput } from "../content-schema";

const url = process.env.PATCHCTL_TEST_DATABASE_URL;
export const testNamespace = `pct_test_${randomUUID().replaceAll("-", "")}`;
describe.skipIf(!url)("isolated Postgres schema and connection", () => {
  const pool = new Pool({ connectionString: url });
  const input = { namespace: testNamespace, table: "articles", key: "id", isolation: { mode: "row", tenantColumn: "tenant_id" }, fields: {
    title: { type: "text", readable: true, editable: true }, summary_en: { type: "text", readable: true, editable: true, nullable: true },
  } };
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Use an isolated database ending in _test");
    await pool.query(`CREATE SCHEMA "${testNamespace}"`);
    await pool.query(`CREATE TABLE "${testNamespace}".articles (id text PRIMARY KEY, tenant_id text NOT NULL, title text NOT NULL, summary_en text)`);
  });
  afterAll(async () => {
    await pool.query(`DROP SCHEMA "${testNamespace}" CASCADE`);
    await pool.end();
  });
  it("connects and introspects the declared primary key and fields", async () => {
    await expect(new PostgresProbe().test(url!)).resolves.toBeUndefined();
    expect(await new PostgresSchemaInspector().inspect(url!, contentSchemaInput.parse(input))).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects undeclared key identity and missing columns", async () => {
    const inspector = new PostgresSchemaInspector();
    await expect(inspector.inspect(url!, contentSchemaInput.parse({ ...input, key: "tenant_id" }))).rejects.toMatchObject({ code: "INVALID_SCHEMA" });
    await expect(inspector.inspect(url!, contentSchemaInput.parse({ ...input, fields: { missing: { type: "text", readable: true, editable: true } } }))).rejects.toMatchObject({ code: "INVALID_SCHEMA" });
  });
  it("changes fingerprint when the live schema changes", async () => {
    const inspector = new PostgresSchemaInspector();
    const schema = contentSchemaInput.parse(input);
    const before = await inspector.inspect(url!, schema);
    await pool.query(`ALTER TABLE "${testNamespace}".articles ADD COLUMN extra text`);
    expect(await inspector.inspect(url!, schema)).not.toBe(before);
  });
  it("redacts credentials from connection failures", async () => {
    await expect(new PostgresProbe().test("postgresql://private:secret@127.0.0.1:1/missing")).rejects.toMatchObject({ message: "Could not connect to the content source." });
  });
});
