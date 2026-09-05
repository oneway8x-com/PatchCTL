import { z } from "zod";
import { authorize, type Actor } from "../access";
import { fingerprint, registeredSchema } from "../content-schema";
import type { ConflictChecker } from "../conflicts.postgres";
import type { PatchRepository } from "../patch";
import type { SourceRepository, SourceSecrets } from "../source";
import { getPatch } from "./get-patch";
import { requireSource } from "./sources";
import { PatchError } from "../patch.errors";
export async function checkConflicts(
  input: unknown,
  actor: Actor,
  id: string,
  patches: PatchRepository,
  sources: SourceRepository,
  secrets: SourceSecrets,
  checker: ConflictChecker,
) {
  authorize(actor, "review");
  const { revision } = z
    .object({ revision: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(input);
  const patch = await getPatch(actor, id, patches, sources);
  if (
    revision !== patch.revision ||
    fingerprint({ tenantId: patch.tenantId, payload: patch.payload }) !==
      revision
  )
    throw new PatchError(409, "STALE_REVIEW", "The patch revision changed.");
  const source = await requireSource(actor, patch.payload.sourceId, sources);
  const schema = registeredSchema(source.schema);
  const url = secrets.resolve(actor.tenantId, source.secretRef);
  if (
    fingerprint(schema) !== patch.payload.schemaVersion ||
    fingerprint({ sourceId: source.id, secretRef: source.secretRef, url }) !==
      patch.payload.sourceFingerprint
  )
    throw new PatchError(
      409,
      "SOURCE_CHANGED",
      "Source configuration changed. Prepare a new patch.",
    );
  await checker.check(url, schema, actor.tenantId, patch.payload.records);
  return {
    conflicts: [],
    checkedAt: new Date().toISOString(),
    finalCheckRequiredAtApply: true,
  };
}
