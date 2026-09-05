import { createHash } from "node:crypto";
import { z } from "zod";
import { PatchError } from "./patch.errors";

export const identifier = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/);
const field = z.object({
  type: z.enum(["text", "enum", "relation", "timestamp"]), readable: z.boolean(), editable: z.boolean(),
  nullable: z.boolean().default(false), maxLength: z.number().int().min(1).max(100000).default(10000),
  values: z.array(z.string().min(1).max(120)).max(100).optional(),
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/).optional(),
  relation: z.object({ namespace: identifier.default("public"), table: identifier, key: identifier,
    label: identifier, tenantColumn: identifier }).strict().optional(),
}).strict();
export const contentSchemaInput = z.object({
  namespace: identifier.default("public"), table: identifier, key: identifier,
  isolation: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("row"), tenantColumn: identifier }).strict(),
    z.object({ mode: z.literal("dedicated"), dedicatedTenantId: z.string().min(1) }).strict(),
  ]),
  fields: z.record(identifier, field).refine(v => Object.keys(v).length > 0 && Object.keys(v).length <= 50, "Declare 1 to 50 fields"),
  schedules: z.array(z.object({ startsAt: identifier, endsAt: identifier }).strict()).max(10).default([]),
}).strict().superRefine((schema, ctx) => {
  for (const [name, f] of Object.entries(schema.fields)) {
    if (f.editable && (!f.readable || name === schema.key || (schema.isolation.mode === "row" && name === schema.isolation.tenantColumn)))
      ctx.addIssue({ code: "custom", path: ["fields", name], message: "Editable fields must be readable and cannot be identity or Tenant columns" });
    if (f.type === "enum" && (!f.values?.length || new Set(f.values).size !== f.values.length))
      ctx.addIssue({ code: "custom", path: ["fields", name], message: "Enums require unique allowed values" });
    if (f.type === "relation" && !f.relation)
      ctx.addIssue({ code: "custom", path: ["fields", name], message: "Relations require an explicit scoped target" });
  }
  for (const [index, schedule] of schema.schedules.entries()) {
    if (schedule.startsAt === schedule.endsAt || [schedule.startsAt, schedule.endsAt].some(name => schema.fields[name]?.type !== "timestamp" || !schema.fields[name]?.readable))
      ctx.addIssue({ code: "custom", path: ["schedules", index], message: "Schedule endpoints must be distinct readable timestamp fields" });
  }
  for (const [name, f] of Object.entries(schema.fields)) if (f.type === "timestamp" && f.editable && !schema.schedules.some(schedule => [schedule.startsAt, schedule.endsAt].includes(name)))
    ctx.addIssue({ code: "custom", path: ["fields", name], message: "Editable timestamps require an explicit schedule pair" });
});
export type ContentSchema = z.infer<typeof contentSchemaInput>;
export type RegisteredSchema = { definition: ContentSchema; databaseFingerprint: string };
export interface SchemaInspector { inspect(url: string, schema: ContentSchema): Promise<string> }
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(",")}}`;
}
export function fingerprint(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function quoteIdentifier(value: string) { return `"${identifier.parse(value)}"`; }
export function tableName(schema: Pick<ContentSchema, "namespace" | "table">) { return `${quoteIdentifier(schema.namespace)}.${quoteIdentifier(schema.table)}`; }
export function registeredSchema(value: unknown): RegisteredSchema {
  const parsed = z.object({ definition: contentSchemaInput, databaseFingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(value);
  if (!parsed.success) throw new PatchError(409, "SCHEMA_REQUIRED", "Configure a valid content schema first.");
  return parsed.data as RegisteredSchema;
}
