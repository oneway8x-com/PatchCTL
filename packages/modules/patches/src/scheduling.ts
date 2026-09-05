import { z } from "zod";
import type { ContentSchema } from "./content-schema";
import { PatchError } from "./patch.errors";
import type { ChangeValue } from "./patch";
const instant = z.string().datetime({ offset: true }).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
export function normalizeTimestamp(value: ChangeValue, nullable: boolean, name: string): string | null {
  if (value === null && nullable) return null;
  if (!instant.safeParse(value).success || !Number.isFinite(Date.parse(String(value))))
    throw new PatchError(400, "INVALID_TIMESTAMP", `${name} requires a valid ISO timestamp with Z or an explicit offset and at most millisecond precision.`);
  const normalized = new Date(String(value)).toISOString();
  if (!/^\d{4}-/.test(normalized)) throw new PatchError(400, "INVALID_TIMESTAMP", `${name} must be within years 0001–9999.`);
  if (normalized.startsWith("0000-")) throw new PatchError(400, "INVALID_TIMESTAMP", `${name} must be within years 0001–9999.`);
  return normalized;
}
export function validateSchedules(schema: ContentSchema, current: Record<string, ChangeValue>, changes: Record<string, ChangeValue>) {
  for (const pair of schema.schedules) {
    if (!Object.hasOwn(changes, pair.startsAt) && !Object.hasOwn(changes, pair.endsAt)) continue;
    const values = { ...current, ...changes };
    const start = normalizeTimestamp(values[pair.startsAt]!, schema.fields[pair.startsAt]!.nullable, pair.startsAt);
    const end = normalizeTimestamp(values[pair.endsAt]!, schema.fields[pair.endsAt]!.nullable, pair.endsAt);
    if (start !== null && end !== null && start >= end)
      throw new PatchError(400, "INVALID_SCHEDULE_RANGE", `${pair.startsAt} must be earlier than ${pair.endsAt}.`);
  }
}
