import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaAccessRepository } from "../access.repository";
import { PrismaSourceRepository } from "../source.repository";
import { PrismaPatchRepository } from "../patch.repository";
import { EnvironmentSourceSecrets } from "../postgres";
import { contentSchemaInput, fingerprint, type RegisteredSchema } from "../content-schema";
import { PostgresSchemaInspector } from "../schema.postgres";
import { PostgresContentReader } from "../content.postgres";
import { PostgresContentWriter } from "../apply.postgres";
import { preparePatch } from "../use-cases/prepare-patch";
import { decidePatch } from "../use-cases/decide-patch";
import { applyPatch } from "../use-cases/apply-patch";
import { patchHistory } from "../use-cases/patch-history";
import type { Actor } from "../access";
const url = process.env.PATCHCTL_TEST_DATABASE_URL;
describe.skipIf(!url)("Prisma identity, transitions and atomic audit persistence", () => {
  const tenantId = randomUUID(), userId = randomUUID(), roleId = randomUUID(), sourceId = randomUUID(), keyId = randomUUID();
  const namespace = `pct_meta_${tenantId.replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  const sources = new PrismaSourceRepository(db), patches = new PrismaPatchRepository(db), access = new PrismaAccessRepository(db);
  const secrets = new EnvironmentSourceSecrets(JSON.stringify({ local: { tenantId, url } }));
  const reader = new PostgresContentReader();
  let schema: RegisteredSchema, actor: Actor, agent: Actor;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Isolated database required");
    await pool.query(`CREATE SCHEMA "${namespace}"`);
    await pool.query(`CREATE TABLE "${namespace}".articles (id text PRIMARY KEY, tenant_id text NOT NULL, title text NOT NULL)`);
    await pool.query("CREATE TABLE IF NOT EXISTS public.patchctl_apply_receipts (tenant_id text NOT NULL, patch_id text NOT NULL, revision text NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(tenant_id,patch_id))");
    await db.tenant.create({ data: { id: tenantId, name: "Test", slug: tenantId } });
    await db.user.create({ data: { id: userId, email: `${userId}@example.test`, passwordHash: "unused" } });
    await db.role.create({ data: { id: roleId, tenantId, name: "Test admin", systemKey: "ADMIN" } });
    await db.membership.create({ data: { tenantId, userId, roleId } });
    const definition = contentSchemaInput.parse({ namespace, table: "articles", key: "id", isolation: { mode: "row", tenantColumn: "tenant_id" }, fields: { title: { type: "text", readable: true, editable: true } } });
    schema = { definition, databaseFingerprint: await new PostgresSchemaInspector().inspect(url, definition) };
    await sources.save({ id: sourceId, tenantId, name: "Articles", secretRef: "local", schema }, true);
    await db.apiKey.create({ data: { id: keyId, tenantId, name: "Test agent", ownerUserId: userId, keyHash: createHash("sha256").update(keyId).digest("hex"), scopes: ["read", "propose", "review", "apply"], connectionIds: [sourceId], expiresAt: new Date(Date.now() + 3600000) } });
    actor = (await access.human({ userId, tenantId }))!;
    agent = (await access.agent(createHash("sha256").update(keyId).digest("hex")))!;
  });
  beforeEach(async () => {
    await pool.query(`DELETE FROM "${namespace}".articles`);
    await pool.query(`INSERT INTO "${namespace}".articles VALUES ('1',$1,'Before')`, [tenantId]);
  });
  afterAll(async () => {
    await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await pool.query("DELETE FROM public.patchctl_apply_receipts WHERE tenant_id=$1", [tenantId]);
    await db.auditLog.deleteMany({ where: { tenantId, entity: "ContentPatch" } });
    await db.contentPatch.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect(); await pool.end();
  });
  async function prepare() {
    const rows = await reader.snapshots(url!, schema, tenantId, ["1"]);
    return preparePatch({ sourceId, schemaVersion: fingerprint(schema), reason: "Fix", records: [{ id: "1", version: rows[0]!.version, changes: { title: "After" } }] }, agent, sources, secrets, reader, patches);
  }
  it("derives real membership and clamps agent scopes; removed memberships are denied", async () => {
    expect(actor.permissions).toContain("apply");
    expect(agent.permissions).toEqual(["read", "propose"]);
    expect(await access.human({ userId, tenantId: randomUUID() })).toBeNull();
    await db.apiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
    expect(await access.agent(createHash("sha256").update(keyId).digest("hex"))).toBeNull();
    await db.apiKey.update({ where: { id: keyId }, data: { revokedAt: null } });
  });
  it("commits exactly one competing review decision and event", async () => {
    const proposal = await prepare();
    const results = await Promise.allSettled(["approved", "rejected"].map(decision => decidePatch({ revision: proposal.revision, decision }, actor, proposal.id, patches, sources)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditLog.count({ where: { tenantId, entityId: proposal.id, action: { in: ["approved", "rejected"] } } })).toBe(1);
  });
  it("persists full provenance and one successful apply event, even after replay and record deletion", async () => {
    const proposal = await prepare();
    await decidePatch({ revision: proposal.revision, decision: "approved" }, actor, proposal.id, patches, sources);
    await applyPatch({ revision: proposal.revision }, actor, proposal.id, patches, sources, secrets, new PostgresContentWriter());
    await applyPatch({ revision: proposal.revision }, actor, proposal.id, patches, sources, secrets, new PostgresContentWriter());
    await pool.query(`DELETE FROM "${namespace}".articles WHERE id='1'`);
    const history = await patchHistory({}, actor, proposal.id, patches, sources);
    expect(history.events.map(e => e.action)).toEqual(["prepared", "approved", "apply-attempt", "applied"]);
    expect(history.events[0]?.actor).toMatchObject({ id: keyId, kind: "agent" });
    expect(history.events[3]?.details).toMatchObject({ reviewerId: userId, appliedBy: userId, records: [{ before: { title: "Before" }, after: { title: "After" } }] });
    const first = await patchHistory({ limit: 2 }, actor, proposal.id, patches, sources);
    const second = await patchHistory({ limit: 2, after: first.nextCursor }, actor, proposal.id, patches, sources);
    expect(second.events.map(e => e.action)).toEqual(["apply-attempt", "applied"]);
    await expect(patchHistory({}, { ...actor, tenantId: randomUUID() }, proposal.id, patches, sources)).rejects.toMatchObject({ status: 404 });
  });
});
