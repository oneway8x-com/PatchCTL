import { randomUUID, randomBytes, createHash, createHmac } from "node:crypto";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaSourceRepository } from "./source.repository";
import { contentSchemaInput } from "./content-schema";
import { PostgresSchemaInspector } from "./schema.postgres";

/** Local fixture provisioning only; never called by an application route. */
export async function seedDemo(url: string) {
  const target = new URL(url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || !/_(test|demo)$/.test(target.pathname))
    throw new Error("Demo requires a loopback database ending in _test or _demo.");
  const tenantId = randomUUID(), userId = randomUUID(), sourceId = randomUUID();
  const namespace = `pct_demo_${tenantId.replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await pool.query(`CREATE SCHEMA "${namespace}"`);
    await pool.query(`CREATE TABLE "${namespace}".articles (id text PRIMARY KEY, tenant_id text NOT NULL, title text NOT NULL, body text NOT NULL, summary_en text)`);
    await pool.query("CREATE TABLE IF NOT EXISTS public.patchctl_apply_receipts (tenant_id text NOT NULL, patch_id text NOT NULL, revision text NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(tenant_id,patch_id))");
    for (let n = 1; n <= 10; n++) await pool.query(`INSERT INTO "${namespace}".articles VALUES ($1,$2,$3,$4,$5)`,
      [String(n).padStart(2, "0"), tenantId, `Article ${n}`, `Article ${n} explains how reviewed content changes protect a publication.`, [null, "", " \t "][n % 3]]);
    await pool.query(`INSERT INTO "${namespace}".articles VALUES ('11',$1,'Control','Already summarized','Keep this summary'),('12',$2,'Other Tenant','Private content',NULL)`, [tenantId, randomUUID()]);
    await db.tenant.create({ data: { id: tenantId, name: "PatchCTL demo", slug: tenantId } });
    await db.user.create({ data: { id: userId, email: `${userId}@example.test`, passwordHash: "unused-demo-only" } });
    const role = await db.role.create({ data: { tenantId, name: "Demo reviewer", systemKey: "ADMIN" } });
    await db.membership.create({ data: { tenantId, userId, roleId: role.id } });
    const definition = contentSchemaInput.parse({ namespace, table: "articles", key: "id", isolation: { mode: "row", tenantColumn: "tenant_id" },
      fields: { title: { type: "text", readable: true, editable: true }, body: { type: "text", readable: true, editable: false }, summary_en: { type: "text", readable: true, editable: true, nullable: true, locale: "en" } } });
    const schema = { definition, databaseFingerprint: await new PostgresSchemaInspector().inspect(url, definition) };
    await new PrismaSourceRepository(db).save({ id: sourceId, tenantId, name: "Demo articles", secretRef: "demo", schema }, true);
    const agentToken = `pct_${randomBytes(32).toString("base64url")}`;
    await db.apiKey.create({ data: { tenantId, name: "Demo agent", ownerUserId: userId, keyHash: createHash("sha256").update(agentToken).digest("hex"), scopes: ["read", "propose"], connectionIds: [sourceId], expiresAt: new Date(Date.now() + 3600000) } });
    const jwtSecret = randomBytes(48).toString("base64url");
    const parts = [ { alg: "HS256", typ: "JWT" }, { sub: userId, tenantId, exp: Math.floor(Date.now() / 1000) + 3600 } ].map(v => Buffer.from(JSON.stringify(v)).toString("base64url"));
    const signing = parts.join(".");
    const humanToken = `${signing}.${createHmac("sha256", jwtSecret).update(signing).digest("base64url")}`;
    return { tenantId, userId, sourceId, namespace, url, jwtSecret, agentToken, humanToken };
  } finally { await db.$disconnect(); await pool.end(); }
}
