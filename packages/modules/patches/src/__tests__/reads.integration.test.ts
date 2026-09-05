import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { contentSchemaInput, type RegisteredSchema } from "../content-schema";
import { queryInput } from "../content";
import { PostgresSchemaInspector } from "../schema.postgres";
import { PostgresContentReader } from "../content.postgres";
const url = process.env.PATCHCTL_TEST_DATABASE_URL;
describe.skipIf(!url)("scoped Postgres content reads", () => {
  const namespace = `pct_read_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url });
  let schema: RegisteredSchema;
  const reader = new PostgresContentReader();
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Isolated test database required");
    await pool.query(`CREATE SCHEMA "${namespace}"`);
    await pool.query(`CREATE TABLE "${namespace}".articles (id text PRIMARY KEY, tenant_id text NOT NULL, title text NOT NULL, summary_en text, private text)`);
    for (let i = 0; i < 55; i++) await pool.query(`INSERT INTO "${namespace}".articles VALUES ($1,'t',$2,$3,'secret')`, [String(i).padStart(3, "0"), `Article ${i}`, i % 3 === 0 ? null : i % 3 === 1 ? " \n\t" : "existing"]);
    await pool.query(`INSERT INTO "${namespace}".articles VALUES ('other','other','Other tenant',NULL,'secret')`);
    const definition = contentSchemaInput.parse({ namespace, table: "articles", key: "id", isolation: { mode: "row", tenantColumn: "tenant_id" }, fields: {
      title: { type: "text", readable: true, editable: true }, summary_en: { type: "text", readable: true, editable: true, nullable: true }, private: { type: "text", readable: false, editable: false },
    } });
    schema = { definition, databaseFingerprint: await new PostgresSchemaInspector().inspect(url, definition) };
  });
  afterAll(async () => { await pool.query(`DROP SCHEMA "${namespace}" CASCADE`); await pool.end(); });
  it("paginates beyond 50 records without exposing another Tenant or hidden columns", async () => {
    const first = await reader.query(url!, schema, "t", queryInput.parse({ limit: 50 }));
    const second = await reader.query(url!, schema, "t", queryInput.parse({ after: first.nextCursor }));
    expect(first.records).toHaveLength(50);
    expect(second.records).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect(first.records[0]?.values).not.toHaveProperty("private");
    expect(first.records[0]?.version).toMatch(/^[a-f0-9]{32}$/);
  });
  it("finds null and whitespace values and applies equality filters without SQL injection", async () => {
    const missing = await reader.query(url!, schema, "t", queryInput.parse({ filters: [{ field: "summary_en", op: "missing" }] }));
    expect(missing.records).toHaveLength(37);
    const exact = await reader.query(url!, schema, "t", queryInput.parse({ filters: [{ field: "title", op: "eq", value: "Article 0" }] }));
    expect(exact.records.map(r => r.id)).toEqual(["000"]);
    expect((await reader.query(url!, schema, "t", queryInput.parse({ filters: [{ field: "title", op: "eq", value: "' OR 1=1 --" }] }))).records).toEqual([]);
  });
  it("denies hidden field reads and changes version after edits to unrelated fields", async () => {
    await expect(reader.query(url!, schema, "t", queryInput.parse({ fields: ["private"] }))).rejects.toMatchObject({ code: "UNREADABLE_FIELD" });
    const before = await reader.query(url!, schema, "t", queryInput.parse({ limit: 1 }));
    await pool.query(`UPDATE "${namespace}".articles SET private='changed' WHERE id='000'`);
    const after = await reader.query(url!, schema, "t", queryInput.parse({ limit: 1 }));
    expect(after.records[0]?.version).not.toBe(before.records[0]?.version);
    expect(after.records[0]?.values).toEqual(before.records[0]?.values);
  });
  it("rejects unknown filters and invalid limits", () => {
    expect(() => queryInput.parse({ limit: 101 })).toThrow();
    expect(() => queryInput.parse({ sql: "DELETE FROM articles" })).toThrow();
  });
});
