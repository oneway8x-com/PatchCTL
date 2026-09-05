import { z } from "zod";
import { authorize, type Actor } from "../access";
import type { PatchRepository } from "../patch";
import type { SourceRepository } from "../source";
import { PatchError } from "../patch.errors";
import { registeredSchema } from "../content-schema";
import { requireSource } from "./sources";
export async function getPatch(
  actor: Actor,
  id: string,
  patches: PatchRepository,
  sources: SourceRepository,
) {
  authorize(actor, "read");
  const patch = await patches.find(actor.tenantId, z.string().uuid().parse(id));
  if (!patch) throw new PatchError(404, "PATCH_NOT_FOUND", "Patch not found.");
  const source = await requireSource(actor, patch.payload.sourceId, sources);
  const schema = registeredSchema(source.schema);
  if (
    patch.payload.records.some((r) =>
      Object.keys(r.after).some(
        (key) => !schema.definition.fields[key]?.readable,
      ),
    )
  )
    throw new PatchError(
      403,
      "FIELD_ACCESS_CHANGED",
      "Access to a field in this patch has changed.",
    );
  return patch;
}
export async function listPatches(
  input: unknown,
  actor: Actor,
  patches: PatchRepository,
) {
  authorize(actor, "read");
  const query = z
    .object({
      after: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .strict()
    .parse(input);
  const items = await patches.list(
    actor.tenantId,
    actor.connectionIds,
    query.after,
    query.limit + 1,
  );
  return {
    items: items.slice(0, query.limit).map((p) => ({
      id: p.id,
      state: p.state,
      revision: p.revision,
      sourceId: p.payload.sourceId,
      reason: p.payload.reason,
      creator: p.payload.creator,
      createdAt: p.payload.createdAt,
      affectedRecords: p.payload.records.length,
    })),
    nextCursor:
      items.length > query.limit ? (items[query.limit - 1]?.id ?? null) : null,
  };
}
