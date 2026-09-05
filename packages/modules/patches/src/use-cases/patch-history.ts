import { z } from "zod";
import type { Actor } from "../access";
import type { PatchAuditRepository } from "../audit";
import type { SourceRepository } from "../source";
import { getPatch } from "./get-patch";
import { PatchError } from "../patch.errors";
export async function patchHistory(
  input: unknown,
  actor: Actor,
  id: string,
  patches: PatchAuditRepository,
  sources: SourceRepository,
) {
  const query = z
    .object({
      after: z.string().max(100).optional(),
      recordId: z.string().max(500).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict()
    .parse(input);
  const patch = await getPatch(actor, id, patches, sources);
  if (
    query.recordId &&
    !patch.payload.records.some((record) => record.id === query.recordId)
  )
    throw new PatchError(
      404,
      "RECORD_NOT_FOUND",
      "Record is not part of this patch.",
    );
  const events = await patches.history(
    actor.tenantId,
    id,
    query.after,
    query.limit + 1,
  );
  return {
    events: events.slice(0, query.limit).map((event) => ({
      ...event,
      details: {
        ...event.details,
        ...(query.recordId && Array.isArray(event.details.records)
          ? {
              records: event.details.records.filter(
                (record) => record.id === query.recordId,
              ),
            }
          : {}),
      },
    })),
    nextCursor:
      events.length > query.limit
        ? (events[query.limit - 1]?.id ?? null)
        : null,
  };
}
