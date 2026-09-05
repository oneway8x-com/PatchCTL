import type { Actor } from "./access";
import type { ApplyReceipt, ContentWriter } from "./apply";
import { canonical, tableName, quoteIdentifier as q, type RegisteredSchema } from "./content-schema";
import { rowProjection, rowScope } from "./content.postgres";
import { lockAndValidateRecords } from "./conflicts.postgres";
import { sourcePool } from "./postgres";
import { PatchError } from "./patch.errors";
import type { Patch } from "./patch";
import { validateRelationTargets } from "./assignment.postgres";
import { validateSchedules } from "./scheduling";

export class PostgresContentWriter implements ContentWriter {
  async apply(url: string, schema: RegisteredSchema, patch: Patch, actor: Actor): Promise<ApplyReceipt> {
    const pool = sourcePool(url);
    const client = await pool.connect().catch(async error => { await pool.end(); throw error; });
    let committing = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`patchctl:${patch.tenantId}:${patch.id}`]);
      const existing = await client.query("SELECT receipt FROM public.patchctl_apply_receipts WHERE tenant_id=$1 AND patch_id=$2", [patch.tenantId, patch.id]);
      if (existing.rows[0]) {
        const receipt = existing.rows[0].receipt as ApplyReceipt;
        if (receipt.revision !== patch.revision || receipt.sourceId !== patch.payload.sourceId) throw new PatchError(409, "RECEIPT_MISMATCH", "An application receipt does not match this revision.");
        await client.query("ROLLBACK");
        return receipt;
      }
      const current = await lockAndValidateRecords(client, schema, patch.tenantId, patch.payload.records);
      for (const record of patch.payload.records) validateSchedules(schema.definition, current.find(row => row.id === record.id)!.values, record.after);
      await validateRelationTargets(client, schema, patch.tenantId, patch.payload.records);
      for (const record of patch.payload.records) {
        const values: unknown[] = [];
        const assignments = Object.entries(record.after).map(([field, value]) => { values.push(value); return `${q(field)}=$${values.length}`; });
        const scope = rowScope(schema.definition, patch.tenantId, values);
        values.push(record.id);
        const result = await client.query(`UPDATE ${tableName(schema.definition)} r SET ${assignments.join(",")}
          WHERE ${scope} AND r.${q(schema.definition.key)}::text=$${values.length}
          RETURNING ${rowProjection(schema.definition, Object.keys(record.after))}`, values);
        if (result.rowCount !== 1 || canonical(result.rows[0].values) !== canonical(record.after))
          throw new PatchError(409, "WRITE_MISMATCH", "The database did not preserve the exact approved values.");
      }
      const receipt: ApplyReceipt = { patchId: patch.id, tenantId: patch.tenantId, revision: patch.revision,
        sourceId: patch.payload.sourceId, appliedAt: new Date().toISOString(), affectedRecords: patch.payload.records.length,
        creator: patch.payload.creator, reviewerId: patch.reviewerId!, appliedBy: actor.id, records: patch.payload.records };
      await client.query("INSERT INTO public.patchctl_apply_receipts (tenant_id,patch_id,revision,receipt) VALUES ($1,$2,$3,$4::jsonb)", [patch.tenantId, patch.id, patch.revision, JSON.stringify(receipt)]);
      committing = true;
      await client.query("COMMIT");
      return receipt;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      // Once COMMIT has been sent, a lost connection is ambiguous. Keep metadata recoverable.
      if (committing) throw new PatchError(503, "APPLY_OUTCOME_UNKNOWN", "Retry apply to reconcile the durable receipt; do not prepare duplicate changes.");
      if (error instanceof PatchError) throw error;
      const code = (error as { code?: string }).code;
      if (code === "42P01") throw new PatchError(503, "RECEIPT_SETUP_REQUIRED", "Install the target-side receipt table before applying.");
      if (code?.startsWith("23")) throw new PatchError(409, "CONSTRAINT_FAILED", "The database rejected this batch. No changes were applied.");
      throw new PatchError(503, "APPLY_RETRYABLE", "The transaction did not complete. Retry this same approved patch.");
    } finally { client.release(); await pool.end(); }
  }
}
