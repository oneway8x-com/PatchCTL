import { z } from "zod";
import { authorize, type Actor } from "../access";
import type { ContentWriter, PatchApplyRepository } from "../apply";
import type { SourceRepository, SourceSecrets } from "../source";
import { fingerprint, registeredSchema } from "../content-schema";
import { PatchError } from "../patch.errors";
import { getPatch } from "./get-patch";
import { requireSource } from "./sources";
import { validateFieldValue } from "../assignment";

export async function applyPatch(input: unknown, actor: Actor, id: string, patches: PatchApplyRepository, sources: SourceRepository, secrets: SourceSecrets, writer: ContentWriter) {
  authorize(actor, "apply");
  const { revision } = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(input);
  const patch = await getPatch(actor, id, patches, sources);
  if (patch.revision !== revision || fingerprint({ tenantId: patch.tenantId, payload: patch.payload }) !== revision)
    throw new PatchError(409, "REVISION_MISMATCH", "Only the exact approved patch can be applied.");
  if (patch.state === "applied") return { id, state: "applied", appliedAt: patch.appliedAt, affectedRecords: patch.payload.records.length };
  if (!["approved", "applying"].includes(patch.state) || !patch.reviewerId || !patch.reviewedAt)
    throw new PatchError(409, "APPROVAL_REQUIRED", "This revision must be approved by a human before apply.");
  const source = await requireSource(actor, patch.payload.sourceId, sources);
  const schema = registeredSchema(source.schema);
  const url = secrets.resolve(actor.tenantId, source.secretRef);
  if (fingerprint(schema) !== patch.payload.schemaVersion || fingerprint({ sourceId: source.id, secretRef: source.secretRef, url }) !== patch.payload.sourceFingerprint)
    throw new PatchError(409, "SOURCE_CHANGED", "Source configuration changed; prepare and review a new patch.");
  for (const record of patch.payload.records) for (const [name, value] of Object.entries(record.after)) {
    const field = schema.definition.fields[name];
    if (!field?.editable || !field.readable) throw new PatchError(409, "POLICY_CHANGED", "A field is no longer editable.");
    validateFieldValue(value, field, name);
  }
  if (!await patches.claimApply(patch, source, actor)) throw new PatchError(409, "APPLY_STATE_CHANGED", "The source or patch state changed. Refresh before retrying.");
  try {
    const receipt = await writer.apply(url, schema, patch, actor);
    await patches.finishApply(patch, receipt);
    return { id, state: "applied", appliedAt: receipt.appliedAt, affectedRecords: receipt.affectedRecords };
  } catch (error) {
    if (error instanceof PatchError && ["RELATION_CONFLICT", "RECORD_CONFLICT", "SCHEMA_CHANGED", "INVALID_SCHEMA", "WRITE_MISMATCH", "CONSTRAINT_FAILED"].includes(error.code))
      await patches.failApply(patch, error.code, error.code !== "CONSTRAINT_FAILED", actor);
    // Network/metadata errors retain applying state. A retry consults the committed target receipt.
    throw error;
  }
}
