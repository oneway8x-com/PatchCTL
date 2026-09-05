import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { contentSchemaInput, fingerprint, type RegisteredSchema } from "../content-schema";
import { PostgresSchemaInspector } from "../schema.postgres";
import { PostgresContentReader } from "../content.postgres";
import { PostgresContentWriter } from "../apply.postgres";
import { PostgresRelationReader } from "../assignment.postgres";
import { preparePatch } from "../use-cases/prepare-patch";
import { readRelationTargets } from "../use-cases/read-relation-targets";
import type { Actor } from "../access";
import type { Patch, ChangeValue } from "../patch";
const url = process.env.PATCHCTL_TEST_DATABASE_URL;
describe.skipIf(!url)("scoped enum and relation assignments", () => {
  const tenantId = randomUUID(), sourceId = randomUUID(), namespace = `pct_assign_${tenantId.replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url });
  const actor: Actor = { id: "reviewer", tenantId, ownerUserId: "reviewer", kind: "human", permissions: ["read", "propose", "review", "apply"], connectionIds: null };
  const reader = new PostgresContentReader(), relations = new PostgresRelationReader(), writer = new PostgresContentWriter();
  let schema: RegisteredSchema, saved: Patch;
  const sources = { find: vi.fn(async () => ({ id: sourceId, tenantId, name: "Articles", secretRef: "local", schema })), list: vi.fn(), save: vi.fn() };
  const secrets = { resolve: () => url! }, patches = { create: vi.fn(async (patch: Patch) => { saved = patch; }), find: vi.fn(), list: vi.fn() };
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Isolated database required");
    await pool.query(`CREATE SCHEMA "${namespace}"`);
    await pool.query(`CREATE TABLE "${namespace}".categories (id text PRIMARY KEY, tenant_id text NOT NULL, label text NOT NULL)`);
    await pool.query(`CREATE TABLE "${namespace}".articles (id text PRIMARY KEY, tenant_id text NOT NULL, placement text NOT NULL, category_id text REFERENCES "${namespace}".categories(id))`);
    await pool.query("CREATE TABLE IF NOT EXISTS public.patchctl_apply_receipts (tenant_id text NOT NULL, patch_id text NOT NULL, revision text NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(tenant_id,patch_id))");
    const definition = contentSchemaInput.parse({ namespace, table: "articles", key: "id", isolation: { mode: "row", tenantColumn: "tenant_id" }, fields: {
      placement: { type: "enum", values: ["HOME", "EARN_TOP"], readable: true, editable: true },
      category_id: { type: "relation", readable: true, editable: true, nullable: true, relation: { namespace, table: "categories", key: "id", label: "label", tenantColumn: "tenant_id" } },
    } });
    schema = { definition, databaseFingerprint: await new PostgresSchemaInspector().inspect(url, definition) };
  });
  beforeEach(async () => {
    await pool.query(`DELETE FROM "${namespace}".articles`); await pool.query(`DELETE FROM "${namespace}".categories`);
    await pool.query(`INSERT INTO "${namespace}".categories VALUES ('old',$1,'Old category'),('new',$1,'New category'),('private','other','Secret label')`, [tenantId]);
    await pool.query(`INSERT INTO "${namespace}".articles VALUES ('1',$1,'HOME','old'),('2',$1,'HOME',NULL)`, [tenantId]);
  });
  afterAll(async () => {
    await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await pool.query("DELETE FROM public.patchctl_apply_receipts WHERE tenant_id=$1", [tenantId]); await pool.end();
  });
  async function prepare(changes: Record<string, ChangeValue>) {
    const records = await reader.snapshots(url!, schema, tenantId, ["1", "2"]);
    await preparePatch({ sourceId, schemaVersion: fingerprint(schema), reason: "Assign placement", records: records.map(record => ({ id: record.id, version: record.version, changes })) }, actor, sources, secrets, reader, patches, relations);
    saved.state = "approved"; saved.reviewerId = actor.id; saved.reviewedAt = new Date().toISOString();
    return saved;
  }
  it("discovers only permitted targets with bounded pagination", async () => {
    const first = await readRelationTargets({ limit: 1 }, actor, sourceId, "category_id", sources, secrets, relations);
    expect(first.targets.map(t => t.id)).toEqual(["new"]);
    const next = await readRelationTargets({ limit: 1, after: first.nextCursor }, actor, sourceId, "category_id", sources, secrets, relations);
    expect(next.targets.map(t => t.id)).toEqual(["old"]); expect(next.nextCursor).toBeNull();
  });
  it("applies a bulk EARN_TOP/category assignment with immutable IDs and labels in its receipt", async () => {
    const patch = await prepare({ placement: "EARN_TOP", category_id: "new" });
    expect(patch.payload.records[0]?.relations?.category_id).toMatchObject({ before: { id: "old", label: "Old category" }, after: { id: "new", label: "New category" } });
    const receipt = await writer.apply(url!, schema, patch, actor);
    expect(receipt.records).toEqual(patch.payload.records);
    expect((await pool.query(`SELECT placement,category_id FROM "${namespace}".articles`)).rows).toEqual([{ placement: "EARN_TOP", category_id: "new" }, { placement: "EARN_TOP", category_id: "new" }]);
  });
  it.each([{ placement: "UNKNOWN" }, { category_id: "missing" }, { category_id: "private" }, { category_id: 12 }, { placement: null }])("rejects invalid or out-of-Tenant assignments", async changes => {
    await expect(prepare(changes)).rejects.toMatchObject({ status: 400 });
  });
  it.each(["delete", "move", "rename"])("blocks the whole patch when a target is changed: %s", async action => {
    const patch = await prepare({ placement: "EARN_TOP", category_id: "new" });
    if (action === "delete") await pool.query(`DELETE FROM "${namespace}".categories WHERE id='new'`);
    if (action === "move") await pool.query(`UPDATE "${namespace}".categories SET tenant_id='other' WHERE id='new'`);
    if (action === "rename") await pool.query(`UPDATE "${namespace}".categories SET label='Changed label' WHERE id='new'`);
    await expect(writer.apply(url!, schema, patch, actor)).rejects.toMatchObject({ code: "RELATION_CONFLICT" });
    expect((await pool.query(`SELECT placement FROM "${namespace}".articles`)).rows.every(r => r.placement === "HOME")).toBe(true);
  });
  it("requires a real foreign key, not just a configured relation label", async () => {
    const definition = structuredClone(schema.definition); definition.fields.category_id!.relation!.table = "articles";
    await expect(new PostgresSchemaInspector().inspect(url!, definition)).rejects.toMatchObject({ code: "INVALID_SCHEMA" });
  });
});
