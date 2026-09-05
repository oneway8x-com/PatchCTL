import type { PoolClient } from "pg";
import { tableName, quoteIdentifier as q, type RegisteredSchema } from "./content-schema";
import { assertSchema } from "./content.postgres";
import { sourcePool } from "./postgres";
import { PatchError } from "./patch.errors";
import type { RelationReader, RelationTarget } from "./assignment";
import type { PatchRecord } from "./patch";
export async function relationTargets(client: PoolClient, schema: RegisteredSchema, tenantId: string, name: string, input: { ids?: string[]; after?: string; limit: number }, lock = false) {
  const field = schema.definition.fields[name];
  const relation = field?.relation;
  if (!field?.readable || field.type !== "relation" || !relation) throw new PatchError(400, "INVALID_RELATION", "Select a readable declared relation.");
  const params: unknown[] = [tenantId];
  const where = [`r.${q(relation.tenantColumn)}::text=$1`];
  if (input.ids) { params.push(input.ids); where.push(`r.${q(relation.key)}::text=ANY($${params.length}::text[])`); }
  if (input.after) { params.push(input.after); where.push(`r.${q(relation.key)}::text COLLATE "C">$${params.length} COLLATE "C"`); }
  params.push(input.limit + 1);
  const result = await client.query(`SELECT r.${q(relation.key)}::text AS id, r.${q(relation.label)}::text AS label,
    md5(to_jsonb(r)::text || ':' || r.xmin::text) AS version FROM ${tableName(relation)} r
    WHERE ${where.join(" AND ")} ORDER BY r.${q(relation.key)}::text COLLATE "C" LIMIT $${params.length} ${lock ? "FOR SHARE" : ""}`, params);
  return { targets: result.rows.slice(0, input.limit) as RelationTarget[], nextCursor: result.rows.length > input.limit ? result.rows[input.limit - 1].id as string : null };
}
export async function validateRelationTargets(client: PoolClient, schema: RegisteredSchema, tenantId: string, records: PatchRecord[]) {
  for (const name of Object.keys(schema.definition.fields).sort()) {
    if (schema.definition.fields[name]?.type !== "relation") continue;
    const affected = records.filter(record => Object.hasOwn(record.after, name) && record.after[name] !== null);
    if (!affected.length) continue;
    const ids = [...new Set(affected.map(record => String(record.after[name])))].sort();
    const result = await relationTargets(client, schema, tenantId, name, { ids, limit: 100 }, true);
    for (const record of affected) {
      const target = result.targets.find(target => target.id === record.after[name]);
      if (!target || target.version !== record.relations?.[name]?.after?.version)
        throw new PatchError(409, "RELATION_CONFLICT", "A relation target changed or is unavailable. Prepare and review a new patch.", { recordId: record.id, field: name });
    }
  }
}
export class PostgresRelationReader implements RelationReader {
  async targets(url: string, schema: RegisteredSchema, tenantId: string, field: string, input: { ids?: string[]; after?: string; limit: number }) {
    const pool = sourcePool(url), client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await assertSchema(client, schema);
      const result = await relationTargets(client, schema, tenantId, field, input);
      await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); await pool.end(); }
  }
}
