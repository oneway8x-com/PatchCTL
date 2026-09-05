import { randomUUID } from "node:crypto";
import { authorize, type Actor } from "../access";
import { fingerprint, registeredSchema } from "../content-schema";
import type { ContentReader } from "../content";
import type { SourceRepository, SourceSecrets } from "../source";
import { proposalInput, type Patch, type PatchPayload, type PatchRepository, type PatchRecord, type ChangeValue } from "../patch";
import { PatchError } from "../patch.errors";
import { requireSource } from "./sources";
import { validateTextValue } from "../text-value";

export async function preparePatch(input: unknown, actor: Actor, sources: SourceRepository, secrets: SourceSecrets, reader: ContentReader, patches: PatchRepository) {
  authorize(actor, "propose");
  if (Buffer.byteLength(JSON.stringify(input) ?? "") > 2_000_000) throw new PatchError(413, "PATCH_TOO_LARGE", "Patch payload exceeds 2 MB.");
  const parsed = proposalInput.parse(input);
  const source = await requireSource(actor, parsed.sourceId, sources);
  const schema = registeredSchema(source.schema);
  if (parsed.schemaVersion !== fingerprint(schema)) throw new PatchError(409, "SCHEMA_CHANGED", "Read the current schema before preparing a patch.");
  const ids = parsed.records.map(r => r.id);
  if (new Set(ids).size !== ids.length) throw new PatchError(400, "DUPLICATE_RECORD", "A record can appear only once per patch.");
  const url = secrets.resolve(actor.tenantId, source.secretRef);
  const snapshots = await reader.snapshots(url, schema, actor.tenantId, ids);
  const records: PatchRecord[] = [];
  for (const record of parsed.records) {
    const snapshot = snapshots.find(r => r.id === record.id);
    if (!snapshot || snapshot.version !== record.version) throw new PatchError(409, "STALE_RECORD", "A selected record changed or is unavailable. Read it again.");
    const before: Record<string, ChangeValue> = {};
    for (const [name, value] of Object.entries(record.changes)) {
      const field = Object.hasOwn(schema.definition.fields, name) ? schema.definition.fields[name] : undefined;
      if (!field?.editable || !field.readable) throw new PatchError(400, "FIELD_NOT_EDITABLE", `Field ${name} is not editable.`);
      // Enum/relation write support is enabled only with its dedicated validation use case.
      if (field.type !== "text") throw new PatchError(400, "UNSUPPORTED_CHANGE", "Only text changes are currently enabled.");
      try { validateTextValue(value, { nullable: field.nullable, maxLength: field.maxLength }, name); }
      catch (error) {
        if (error instanceof PatchError) throw new PatchError(error.status, error.code, error.message, { recordId: record.id, field: name });
        throw error;
      }
      const previous = snapshot.values[name];
      if (previous === undefined) throw new PatchError(409, "MISSING_FIELD", "The record no longer matches the schema.");
      if (previous === value) throw new PatchError(400, "NO_CHANGE", `Field ${name} is unchanged.`);
      before[name] = previous;
    }
    records.push({ id: record.id, version: record.version, before, after: record.changes });
  }
  const payload: PatchPayload = { sourceId: source.id, schemaVersion: parsed.schemaVersion,
    sourceFingerprint: fingerprint({ sourceId: source.id, secretRef: source.secretRef, url }), reason: parsed.reason,
    ...(parsed.agentRunLabel ? { agentRunLabel: parsed.agentRunLabel } : {}), records,
    creator: { id: actor.id, kind: actor.kind, ownerUserId: actor.ownerUserId }, createdAt: new Date().toISOString() };
  const patch: Patch = { id: randomUUID(), tenantId: actor.tenantId, revision: fingerprint({ tenantId: actor.tenantId, payload }), payload,
    state: "pending", reviewerId: null, reviewedAt: null, rejectionReason: null, appliedAt: null, failureCode: null };
  await patches.create(patch);
  return { id: patch.id, revision: patch.revision, affectedRecords: records.length, state: patch.state, reviewPath: `/patches/${patch.id}` };
}
