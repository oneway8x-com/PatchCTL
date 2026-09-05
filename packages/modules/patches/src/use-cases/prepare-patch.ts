import { randomUUID } from "node:crypto";
import { authorize, type Actor } from "../access";
import { fingerprint, registeredSchema } from "../content-schema";
import type { ContentReader } from "../content";
import type { SourceRepository, SourceSecrets } from "../source";
import { proposalInput, type Patch, type PatchPayload, type PatchRepository, type PatchRecord, type ChangeValue } from "../patch";
import { PatchError } from "../patch.errors";
import { requireSource } from "./sources";
import { validateFieldValue, type RelationReader } from "../assignment";
import { isMissingText } from "../missing-text";

export async function preparePatch(input: unknown, actor: Actor, sources: SourceRepository, secrets: SourceSecrets, reader: ContentReader, patches: PatchRepository, relations?: RelationReader) {
  authorize(actor, "propose");
  if (Buffer.byteLength(JSON.stringify(input) ?? "") > 2_000_000) throw new PatchError(413, "PATCH_TOO_LARGE", "Patch payload exceeds 2 MB.");
  const parsed = proposalInput.parse(input);
  const source = await requireSource(actor, parsed.sourceId, sources);
  const schema = registeredSchema(source.schema);
  if (parsed.translation) {
    const from = schema.definition.fields[parsed.translation.sourceField], to = schema.definition.fields[parsed.translation.targetField];
    if (parsed.mode !== "fill-missing" || !from?.readable || !to?.editable || from.type !== "text" || to.type !== "text" ||
      !from.locale || !to.locale || from.locale === to.locale || parsed.translation.sourceField === parsed.translation.targetField)
      throw new PatchError(400, "INVALID_TRANSLATION", "Translations require distinct declared source/target locales and fill-missing mode.");
  }
  if (parsed.schemaVersion !== fingerprint(schema)) throw new PatchError(409, "SCHEMA_CHANGED", "Read the current schema before preparing a patch.");
  const ids = parsed.records.map(r => r.id);
  if (new Set(ids).size !== ids.length) throw new PatchError(400, "DUPLICATE_RECORD", "A record can appear only once per patch.");
  const url = secrets.resolve(actor.tenantId, source.secretRef);
  const snapshots = await reader.snapshots(url, schema, actor.tenantId, ids);
  const records: PatchRecord[] = [];
  for (const record of parsed.records) {
    const snapshot = snapshots.find(r => r.id === record.id);
    if (!snapshot || snapshot.version !== record.version) throw new PatchError(409, "STALE_RECORD", "A selected record changed or is unavailable. Read it again.");
    if (parsed.translation && (isMissingText(snapshot.values[parsed.translation.sourceField]) || typeof snapshot.values[parsed.translation.sourceField] !== "string" || Object.keys(record.changes).some(name => name !== parsed.translation!.targetField)))
      throw new PatchError(400, "INVALID_TRANSLATION", "Supply source text and change only the target locale.", { recordId: record.id });
    const before: Record<string, ChangeValue> = {};
    for (const [name, value] of Object.entries(record.changes)) {
      const field = Object.hasOwn(schema.definition.fields, name) ? schema.definition.fields[name] : undefined;
      if (!field?.editable || !field.readable) throw new PatchError(400, "FIELD_NOT_EDITABLE", `Field ${name} is not editable.`);
      if (parsed.mode === "fill-missing" && field.type !== "text") throw new PatchError(400, "UNSUPPORTED_CHANGE", "Fill-missing requires text fields.");
      try { validateFieldValue(value, field, name); }
      catch (error) {
        if (error instanceof PatchError) throw new PatchError(error.status, error.code, error.message, { recordId: record.id, field: name });
        throw error;
      }
      const previous = snapshot.values[name];
      if (previous === undefined) throw new PatchError(409, "MISSING_FIELD", "The record no longer matches the schema.");
      if (parsed.mode === "fill-missing" && (!isMissingText(previous) || isMissingText(value)))
        throw new PatchError(400, "TARGET_NOT_MISSING", "Fill-missing requires an empty target and nonempty replacement.", { recordId: record.id, field: name });
      if (previous === value) throw new PatchError(400, "NO_CHANGE", `Field ${name} is unchanged.`);
      before[name] = previous;
    }
    records.push({ id: record.id, version: record.version, before, after: record.changes });
  }
  for (const [name, field] of Object.entries(schema.definition.fields)) {
    const affected = records.filter(record => Object.hasOwn(record.after, name));
    if (field.type !== "relation" || !affected.length) continue;
    if (!relations) throw new PatchError(503, "RELATION_READER_REQUIRED", "Relation validation is not configured.");
    // Two bounded pages cover at most 100 before and 100 after IDs without N+1 requests.
    const targets = new Map<string, import("../assignment").RelationTarget>();
    const ids = [...new Set(affected.flatMap(record => [record.before[name], record.after[name]]).filter((id): id is string => typeof id === "string"))];
    for (let start = 0; start < ids.length; start += 100) {
      const result = await relations.targets(url, schema, actor.tenantId, name, { ids: ids.slice(start, start + 100), limit: 100 });
      for (const target of result.targets) targets.set(target.id, target);
    }
    for (const record of affected) {
      const after = record.after[name] === null ? null : targets.get(String(record.after[name]));
      if (after === undefined) throw new PatchError(400, "INVALID_RELATION_TARGET", "The relation target is unavailable in this Tenant.", { recordId: record.id, field: name });
      record.relations = { ...record.relations, [name]: { before: targets.get(String(record.before[name])) ?? null, after } };
    }
  }
  const payload: PatchPayload = { sourceId: source.id, schemaVersion: parsed.schemaVersion,
    sourceFingerprint: fingerprint({ sourceId: source.id, secretRef: source.secretRef, url }), reason: parsed.reason, mode: parsed.mode,
    ...(parsed.translation ? { translation: { sourceField: parsed.translation.sourceField, targetField: parsed.translation.targetField } } : {}),
    ...(parsed.agentRunLabel ? { agentRunLabel: parsed.agentRunLabel } : {}), records,
    creator: { id: actor.id, kind: actor.kind, ownerUserId: actor.ownerUserId }, createdAt: new Date().toISOString() };
  const patch: Patch = { id: randomUUID(), tenantId: actor.tenantId, revision: fingerprint({ tenantId: actor.tenantId, payload }), payload,
    state: "pending", reviewerId: null, reviewedAt: null, rejectionReason: null, appliedAt: null, failureCode: null };
  await patches.create(patch);
  return { id: patch.id, revision: patch.revision, affectedRecords: records.length, state: patch.state, reviewPath: `/patches/${patch.id}` };
}
