import type { PoolClient } from "pg";
import { assertSchema, readSnapshots } from "./content.postgres";
import { sourcePool } from "./postgres";
import { tableName, type RegisteredSchema } from "./content-schema";
import type { PatchRecord } from "./patch";
import { PatchError } from "./patch.errors";

export async function lockAndValidateRecords(client: PoolClient, schema: RegisteredSchema, tenantId: string, records: PatchRecord[]) {
  // The caller owns this transaction; table/row locks remain held until its commit/rollback.
  await client.query(`LOCK TABLE ${tableName(schema.definition)} IN ROW SHARE MODE`);
  const targets = [...new Set(Object.values(schema.definition.fields).filter(field => field.type === "relation" && field.relation).map(field => tableName(field.relation!)))].sort();
  for (const target of targets) await client.query(`LOCK TABLE ${target} IN ROW SHARE MODE`);
  await assertSchema(client, schema);
  const current = await readSnapshots(client, schema, tenantId, records.map(r => r.id), true);
  const conflicts = records.flatMap(record => {
    const row = current.find(r => r.id === record.id);
    if (row && row.version === record.version && Object.entries(record.before).every(([field, value]) => row.values[field] === value)) return [];
    return [{ id: record.id, code: row ? "CHANGED" : "UNAVAILABLE", before: record.before, proposed: record.after,
      current: row ? Object.fromEntries(Object.keys(record.after).map(field => [field, row.values[field]])) : null }];
  });
  if (conflicts.length) throw new PatchError(409, "RECORD_CONFLICT", "Records changed after preparation. No changes were applied; prepare and review a new patch.", { conflicts });
  return current;
}
export interface ConflictChecker {
  check(url: string, schema: RegisteredSchema, tenantId: string, records: PatchRecord[]): Promise<void>;
}
export class PostgresConflictChecker implements ConflictChecker {
  async check(url: string, schema: RegisteredSchema, tenantId: string, records: PatchRecord[]) {
    const pool = sourcePool(url);
    const client = await pool.connect().catch(async error => { await pool.end(); throw error; });
    try { await client.query("BEGIN"); await lockAndValidateRecords(client, schema, tenantId, records); }
    finally { await client.query("ROLLBACK").catch(() => {}); client.release(); await pool.end(); }
  }
}
