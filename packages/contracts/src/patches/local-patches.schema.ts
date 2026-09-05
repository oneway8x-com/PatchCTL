import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const LocalValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const record = z.record(z.string(), LocalValueSchema);
export const LocalOperationSchema = z.object({
  id: z.string().uuid(), resource: z.string().min(1), recordId: z.string().min(1),
  operation: z.literal("UPDATE"), before: record, after: record,
  expectedVersion: z.object({ snapshotHash: hash }).strict(), schemaHash: hash,
}).strict();
export const LocalFieldSchema = z.object({
  name: z.string().min(1), type: z.enum(["string", "text", "number", "boolean", "date", "datetime", "enum", "relation", "unsupported"]),
  nullable: z.boolean(), readonly: z.boolean(), pgType: z.string(),
  enumValues: z.array(z.string()).optional(),
  relation: z.object({ resource: z.string(), column: z.string() }).strict().optional(),
}).strict();
export const LocalResourceSchema = z.object({
  name: z.string(), schemaName: z.string(), tableName: z.string(), primaryKey: z.string().nullable(),
  fields: z.array(LocalFieldSchema),
  constraints: z.array(z.object({ name: z.string(), kind: z.string(), definition: z.string(), columns: z.array(z.string()) }).strict()),
}).strict();
export const LocalProposalSchema = z.object({
  id: z.string().uuid(), connectionId: z.string().uuid(), databaseId: z.string().uuid(),
  title: z.string().min(1).max(200), createdAt: z.string().datetime(),
  operations: z.array(LocalOperationSchema).min(1).max(100),
  resources: z.array(LocalResourceSchema).min(1).max(100),
}).strict().superRefine((p, ctx) => {
  const records = p.operations.map((op) => JSON.stringify([op.resource, op.recordId]));
  if (new Set(records).size !== records.length || new Set(p.operations.map((op) => op.id)).size !== p.operations.length)
    ctx.addIssue({ code: "custom", message: "Duplicate operations." });
  if (new Set(p.resources.map((r) => r.name)).size !== p.resources.length)
    ctx.addIssue({ code: "custom", message: "Duplicate resources." });
  for (const op of p.operations) {
    const resource = p.resources.find((r) => r.name === op.resource);
    if (!resource || !resource.primaryKey || new Set(resource.fields.map((f) => f.name)).size !== resource.fields.length) {
      ctx.addIssue({ code: "custom", message: "Invalid resource metadata." }); continue;
    }
    const before = Object.keys(op.before).sort(), after = Object.keys(op.after).sort();
    if (JSON.stringify(before) !== JSON.stringify(after) || !before.includes(resource.primaryKey))
      ctx.addIssue({ code: "custom", message: "Invalid before/after shape." });
    let changed = false;
    for (const name of after) {
      const field = resource.fields.find((f) => f.name === name);
      if (!field || field.type === "unsupported") ctx.addIssue({ code: "custom", message: "Unselected field." });
      if (op.before[name] !== op.after[name]) {
        changed = true;
        if (!field || field.readonly || name === resource.primaryKey)
          ctx.addIssue({ code: "custom", message: "Readonly field." });
      }
    }
    if (!changed) ctx.addIssue({ code: "custom", message: "Empty operation." });
  }
  if (p.resources.some((r) => !p.operations.some((op) => op.resource === r.name)))
    ctx.addIssue({ code: "custom", message: "Unrelated resource metadata." });
});
export const LocalStatusSchema = z.enum(["SUBMITTED", "APPROVED", "REJECTED", "APPLIED", "FAILED", "CONFLICT"]);
const actor = z.object({ id: z.string(), kind: z.enum(["human", "agent"]) }).strict();
export const LocalPatchSchema = z.object({
  id: z.string().uuid(), tenantId: z.string(), revision: hash, status: LocalStatusSchema,
  proposal: LocalProposalSchema, creator: actor, reviewerId: z.string().nullable(),
  reviewedAt: z.string().nullable(), appliedAt: z.string().nullable(), failureCode: z.string().nullable(),
  events: z.array(z.object({ event: z.string(), actor, timestamp: z.string() }).strict()),
}).strict();
export const LocalDecisionSchema = z.object({ revision: hash, decision: z.enum(["APPROVED", "REJECTED"]) }).strict();
export const LocalResultSchema = z.object({
  revision: hash, status: z.enum(["STARTED", "APPLIED", "FAILED", "CONFLICT"]),
  code: z.enum(["PATCH_CONFLICT", "SCHEMA_CHANGED", "INVALID_VALUE", "FIELD_READONLY", "RESOURCE_NOT_FOUND", "RELATION_NOT_FOUND", "DATABASE_UNAVAILABLE", "APPLY_FAILED"]).optional(),
}).strict();
export type LocalProposal = z.infer<typeof LocalProposalSchema>;
export type LocalPatch = z.infer<typeof LocalPatchSchema>;
export type LocalExecutionResult = z.infer<typeof LocalResultSchema>;
export const LocalPatchListSchema = z.object({ items: z.array(LocalPatchSchema), nextCursor: z.string().nullable() }).strict();
export const LocalClientTokenSchema = z.object({ token: z.string(), connectionId: z.string().uuid(), tenantId: z.string() }).strict();
export function canonicalLocal(value: unknown): string {
  function stable(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(stable);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, item]) => [k, stable(item)]));
    return v;
  }
  return JSON.stringify(stable(value));
}
