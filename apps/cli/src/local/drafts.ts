import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { LocalError, type Field, type Resource } from "@patchctl/postgres";
import { tenantIdSchema } from "./config.js";

const valueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const recordSchema = z.record(z.string(), valueSchema);
export const operationSchema = z
  .object({
    id: z.string().uuid(),
    resource: z.string(),
    recordId: z.string(),
    operation: z.literal("UPDATE"),
    before: recordSchema,
    after: recordSchema,
    expectedVersion: z
      .object({ snapshotHash: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict(),
    schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const draftSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: tenantIdSchema,
    databaseId: z.string().uuid().optional(),
    title: z.string().max(200).optional(),
    status: z.enum([
      "DRAFT",
      "SUBMITTED",
      "APPROVED",
      "REJECTED",
      "APPLIED",
      "FAILED",
      "CONFLICT",
    ]),
    actor: z
      .object({
        type: z.enum(["human", "agent"]),
        name: z.string().max(100).optional(),
      })
      .strict(),
    operations: z.array(operationSchema).max(100),
    createdAt: z.string().datetime(),
  })
  .strict();
export type Draft = z.infer<typeof draftSchema>;
export type Operation = z.infer<typeof operationSchema>;
export function fingerprint(value: unknown): string {
  const stable = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(stable);
    if (typeof input === "object" && input !== null)
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => [key, stable(item)]),
      );
    return input;
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}
export function startDraft(tenantId: string, title?: string): Draft {
  return draftSchema.parse({
    id: randomUUID(),
    tenantId,
    title,
    status: "DRAFT",
    actor: { type: "agent" },
    operations: [],
    createdAt: new Date().toISOString(),
  });
}
export function ensureDraft(draft: Draft): void {
  if (draft.status !== "DRAFT")
    throw new LocalError(
      "PATCH_ALREADY_SUBMITTED",
      "Submitted patches are immutable. Start a new patch.",
    );
}
export function parseValue(
  field: Field,
  raw: string,
): z.infer<typeof valueSchema> {
  if (field.readonly)
    throw new LocalError("FIELD_READONLY", "The selected field is read-only.");
  if (raw === "null") {
    if (!field.nullable)
      throw new LocalError("INVALID_VALUE", "The field cannot be null.");
    return null;
  }
  if (field.enumValues && !field.enumValues.includes(raw))
    throw new LocalError(
      "INVALID_ENUM_VALUE",
      "Value is not one of the declared enum values.",
    );
  if (field.pgType === "bool") {
    if (raw !== "true" && raw !== "false")
      throw new LocalError(
        "INVALID_VALUE",
        "Boolean values must be true or false.",
      );
    return raw === "true";
  }
  if (
    ["int2", "int4", "int8", "numeric", "float4", "float8"].includes(
      field.pgType,
    )
  ) {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw))
      throw new LocalError(
        "INVALID_VALUE",
        "Expected a finite decimal number.",
      );
    if (["int2", "int4", "int8"].includes(field.pgType)) {
      if (!/^-?\d+$/.test(raw))
        throw new LocalError("INVALID_VALUE", "Expected an integer.");
      const n = BigInt(raw);
      const bits =
        field.pgType === "int2" ? 16n : field.pgType === "int4" ? 32n : 64n;
      if (n < -(2n ** (bits - 1n)) || n >= 2n ** (bits - 1n))
        throw new LocalError(
          "INVALID_VALUE",
          "Integer is outside the PostgreSQL type range.",
        );
    }
    if (field.pgType === "int8" || field.pgType === "numeric") return raw;
    const value = Number(raw);
    if (!Number.isFinite(value))
      throw new LocalError("INVALID_VALUE", "Expected a finite number.");
    return value;
  }
  if (field.pgType === "date") {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
      Number.isNaN(Date.parse(raw)) ||
      new Date(raw).toISOString().slice(0, 10) !== raw
    )
      throw new LocalError("INVALID_VALUE", "Expected a valid ISO date.");
  }
  if (["timestamp", "timestamptz"].includes(field.pgType)) {
    const valid =
      field.pgType === "timestamptz"
        ? z.string().datetime({ offset: true }).safeParse(raw).success
        : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(raw);
    if (!valid || Number.isNaN(Date.parse(raw)))
      throw new LocalError(
        "INVALID_VALUE",
        "Expected an ISO datetime (include a timezone for timestamptz).",
      );
  }
  if (field.pgType === "uuid" && !z.string().uuid().safeParse(raw).success)
    throw new LocalError("INVALID_VALUE", "Expected a UUID.");
  if (raw.includes("\0"))
    throw new LocalError(
      "INVALID_VALUE",
      "PostgreSQL text cannot contain NUL.",
    );
  return raw;
}
export function updateDraft(
  draft: Draft,
  resource: Resource,
  recordId: string,
  snapshot: { record: Record<string, unknown>; hash: string },
  changes: Record<string, z.infer<typeof valueSchema>>,
): Operation {
  ensureDraft(draft);
  const existing = draft.operations.find(
    (op) => op.resource === resource.name && op.recordId === recordId,
  );
  if (
    existing &&
    (existing.expectedVersion.snapshotHash !== snapshot.hash ||
      existing.schemaHash !== fingerprint(resource))
  )
    throw new LocalError(
      "PATCH_CONFLICT",
      "The record or schema changed after the patch was started.",
    );
  const operation = operationSchema.parse({
    id: existing?.id ?? randomUUID(),
    resource: resource.name,
    recordId,
    operation: "UPDATE",
    before: existing?.before ?? snapshot.record,
    after: { ...(existing?.after ?? snapshot.record), ...changes },
    expectedVersion: { snapshotHash: snapshot.hash },
    schemaHash: fingerprint(resource),
  });
  if (existing)
    draft.operations[draft.operations.indexOf(existing)] = operation;
  else draft.operations.push(operation);
  return operation;
}
export function diffDraft(draft: Draft) {
  return draft.operations.map((op) => ({
    resource: op.resource,
    recordId: op.recordId,
    changes: Object.fromEntries(
      Object.keys(op.after)
        .filter((key) => op.before[key] !== op.after[key])
        .map((key) => [key, { before: op.before[key], after: op.after[key] }]),
    ),
  }));
}
export async function readDraft(
  directory: string,
  tenantId: string,
): Promise<Draft> {
  const file = join(directory, `${tenantId}-draft.json`);
  try {
    if ((await stat(file)).size > 2_000_000) throw new Error();
    const draft = draftSchema.parse(JSON.parse(await readFile(file, "utf8")));
    if (draft.tenantId !== tenantId) throw new Error();
    return draft;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      throw new LocalError(
        "NO_ACTIVE_PATCH",
        "Run patchctl patch start first.",
      );
    throw new LocalError(
      "INVALID_PATCH",
      "The local patch is invalid or unreadable.",
    );
  }
}
export async function withDraftLock<T>(
  directory: string,
  tenantId: string,
  action: (save: (draft: Draft) => Promise<void>) => Promise<T>,
): Promise<T> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, `${tenantId}-draft.lock`);
  let handle;
  try {
    handle = await open(lock, "wx", 0o600);
  } catch {
    throw new LocalError(
      "PATCH_BUSY",
      "Another command is editing this patch. A lock left by an interrupted command requires local inspection.",
    );
  }
  try {
    return await action(async (draft) => {
      const parsed = draftSchema.parse(draft);
      if (parsed.tenantId !== tenantId)
        throw new LocalError("INVALID_PATCH", "Patch Tenant does not match.");
      const text = JSON.stringify(parsed, null, 2) + "\n";
      if (Buffer.byteLength(text) > 2_000_000)
        throw new LocalError("PATCH_TOO_LARGE", "Patch exceeds 2 MB.");
      const temporary = join(directory, `${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, text, { mode: 0o600, flag: "wx" });
        await rename(temporary, join(directory, `${tenantId}-draft.json`));
      } finally {
        await unlink(temporary).catch(() => {});
      }
    });
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
