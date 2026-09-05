import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { contentSchemaInput, fingerprint, type RegisteredSchema } from "../content-schema";
import { PostgresSchemaInspector } from "../schema.postgres";
import { PostgresContentReader } from "../content.postgres";
import { PostgresContentWriter } from "../apply.postgres";
import { applyPatch } from "../use-cases/apply-patch";
import type { Patch } from "../patch";
import type { Actor } from "../access";
const url = process.env.PATCHCTL_TEST_DATABASE_URL;
describe.skipIf(!url)("atomic approved Postgres application", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const namespace = `pct_apply_${suffix}`;
  const tenantId = `test-${suffix}`;
  const sourceId = randomUUID();
  const pool = new Pool({ connectionString: url });
  const writer = new PostgresContentWriter();
  const actor: Actor = { id: "reviewer", ownerUserId: "reviewer", kind: "human", tenantId, permissions: ["read", "review", "apply"], connectionIds: null };
  let schema: RegisteredSchema;
  let patch: Patch;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Isolated database required");
    await pool.query(`CREATE SCHEMA "${namespace}"`);
    await pool.query(`CREATE TABLE "${namespace}".articles (id text PRIMARY KEY, tenant_id text NOT NULL, title text NOT NULL CHECK(title <> 'Forbidden'), private text)`);
    await pool.query("CREATE TABLE IF NOT EXISTS public.patchctl_apply_receipts (tenant_id text NOT NULL, patch_id text NOT NULL, revision text NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(tenant_id,patch_id))");
    const definition = contentSchemaInput.parse({ namespace, table: "articles", key: "id", isolation: { mode: "row", tenantColumn: "tenant_id" }, fields: { title: { type: "text", readable: true, editable: true } } });
    schema = { definition, databaseFingerprint: await new PostgresSchemaInspector().inspect(url, definition) };
  });
  beforeEach(async () => {
    await pool.query(`DELETE FROM "${namespace}".articles`);
    await pool.query(`INSERT INTO "${namespace}".articles VALUES ('1',$1,'First','secret'),('2',$1,'Second','secret'),('other','other','Untouched','secret')`, [tenantId]);
    const rows = await new PostgresContentReader().snapshots(url!, schema, tenantId, ["1", "2"]);
    patch = { id: randomUUID(), tenantId, revision: "", state: "approved", reviewerId: actor.id, reviewedAt: new Date().toISOString(), appliedAt: null, failureCode: null, rejectionReason: null,
      payload: { sourceId, schemaVersion: fingerprint(schema), sourceFingerprint: fingerprint({ sourceId, secretRef: "local", url }), reason: "Correct text", creator: { id: "agent", kind: "agent", ownerUserId: "owner" }, createdAt: new Date().toISOString(),
        records: rows.map(r => ({ id: r.id, version: r.version, before: { title: r.values.title! }, after: { title: `New ${r.id}` } })) } };
    patch.revision = fingerprint({ tenantId, payload: patch.payload });
  });
  afterAll(async () => { await pool.query(`DROP SCHEMA "${namespace}" CASCADE`); await pool.query("DELETE FROM public.patchctl_apply_receipts WHERE tenant_id=$1", [tenantId]); await pool.end(); });
  it("writes approved fields atomically and records attribution without touching other tenants", async () => {
    const receipt = await writer.apply(url!, schema, patch, actor);
    expect(receipt).toMatchObject({ affectedRecords: 2, reviewerId: actor.id, appliedBy: actor.id });
    expect((await pool.query(`SELECT title,private FROM "${namespace}".articles ORDER BY id`)).rows).toEqual([
      { title: "New 1", private: "secret" }, { title: "New 2", private: "secret" }, { title: "Untouched", private: "secret" },
    ]);
    expect((await pool.query("SELECT receipt FROM public.patchctl_apply_receipts WHERE tenant_id=$1 AND patch_id=$2", [tenantId, patch.id])).rows[0].receipt).toEqual(receipt);
  });
  it("rolls back earlier writes if a later row violates a constraint", async () => {
    patch.payload.records[1]!.after.title = "Forbidden";
    await expect(writer.apply(url!, schema, patch, actor)).rejects.toMatchObject({ code: "CONSTRAINT_FAILED" });
    expect((await pool.query(`SELECT title FROM "${namespace}".articles WHERE tenant_id=$1 ORDER BY id`, [tenantId])).rows.map(r => r.title)).toEqual(["First", "Second"]);
    expect((await pool.query("SELECT 1 FROM public.patchctl_apply_receipts WHERE tenant_id=$1 AND patch_id=$2", [tenantId, patch.id])).rowCount).toBe(0);
  });
  it("deduplicates concurrent calls and retries without another write", async () => {
    const [first, second] = await Promise.all([writer.apply(url!, schema, patch, actor), writer.apply(url!, schema, patch, actor)]);
    expect(first).toEqual(second);
    const versions = await new PostgresContentReader().snapshots(url!, schema, tenantId, ["1", "2"]);
    await writer.apply(url!, schema, patch, actor);
    expect(await new PostgresContentReader().snapshots(url!, schema, tenantId, ["1", "2"])).toEqual(versions);
  });
  it("blocks changed records with no partial update", async () => {
    await pool.query(`UPDATE "${namespace}".articles SET private='edited externally' WHERE id='2'`);
    await expect(writer.apply(url!, schema, patch, actor)).rejects.toMatchObject({ code: "RECORD_CONFLICT" });
    expect((await pool.query(`SELECT title FROM "${namespace}".articles WHERE id='1'`)).rows[0].title).toBe("First");
  });
  it("recovers after target commit succeeds but metadata persistence fails", async () => {
    const repository = { find: vi.fn(async () => patch), create: vi.fn(), list: vi.fn(), decide: vi.fn(), failApply: vi.fn(),
      claimApply: vi.fn(async () => { patch.state = "applying"; return true; }),
      finishApply: vi.fn().mockRejectedValueOnce(new Error("metadata connection lost")).mockImplementation(async () => { patch.state = "applied"; }),
    };
    const sources = { find: vi.fn(async () => ({ id: sourceId, tenantId, name: "Articles", secretRef: "local", schema })), list: vi.fn(), save: vi.fn() };
    const secrets = { resolve: () => url! };
    await expect(applyPatch({ revision: patch.revision }, actor, patch.id, repository, sources, secrets, writer)).rejects.toThrow("metadata connection lost");
    expect(patch.state).toBe("applying");
    expect(repository.failApply).not.toHaveBeenCalled();
    const versions = await new PostgresContentReader().snapshots(url!, schema, tenantId, ["1", "2"]);
    expect(await applyPatch({ revision: patch.revision }, actor, patch.id, repository, sources, secrets, writer)).toMatchObject({ state: "applied" });
    expect(await new PostgresContentReader().snapshots(url!, schema, tenantId, ["1", "2"])).toEqual(versions);
  });
  it("denies unapproved revisions and direct agent apply before the target writer", async () => {
    const repository = { find: vi.fn(async () => patch), create: vi.fn(), list: vi.fn(), decide: vi.fn(), claimApply: vi.fn(), finishApply: vi.fn(), failApply: vi.fn() };
    const sources = { find: vi.fn(async () => ({ id: sourceId, tenantId, name: "Articles", secretRef: "local", schema })), list: vi.fn(), save: vi.fn() };
    const spyWriter = { apply: vi.fn() };
    patch.state = "pending";
    await expect(applyPatch({ revision: patch.revision }, actor, patch.id, repository, sources, { resolve: () => url! }, spyWriter)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    await expect(applyPatch({}, { ...actor, kind: "agent" }, patch.id, repository, sources, { resolve: () => url! }, spyWriter)).rejects.toMatchObject({ status: 403 });
    expect(spyWriter.apply).not.toHaveBeenCalled();
  });
});
