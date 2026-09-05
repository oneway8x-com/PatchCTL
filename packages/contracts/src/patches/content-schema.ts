import { z } from "zod";
export const PatchIdentifierSchema = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/);
export const PatchContentFieldSchema = z
  .object({
    type: z.enum(["text", "enum", "relation", "timestamp"]),
    readable: z.boolean(),
    editable: z.boolean(),
    nullable: z.boolean().default(false),
    maxLength: z.number().int().min(1).max(100000).default(10000),
    values: z.array(z.string().min(1).max(120)).max(100).optional(),
    locale: z
      .string()
      .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
      .optional(),
    relation: z
      .object({
        namespace: PatchIdentifierSchema.default("public"),
        table: PatchIdentifierSchema,
        key: PatchIdentifierSchema,
        label: PatchIdentifierSchema,
        tenantColumn: PatchIdentifierSchema,
      })
      .strict()
      .optional(),
  })
  .strict();
export const PatchContentSchemaInputSchema = z
  .object({
    namespace: PatchIdentifierSchema.default("public"),
    table: PatchIdentifierSchema,
    key: PatchIdentifierSchema,
    isolation: z.discriminatedUnion("mode", [
      z
        .object({ mode: z.literal("row"), tenantColumn: PatchIdentifierSchema })
        .strict(),
      z
        .object({
          mode: z.literal("dedicated"),
          dedicatedTenantId: z.string().min(1),
        })
        .strict(),
    ]),
    fields: z
      .record(PatchIdentifierSchema, PatchContentFieldSchema)
      .refine(
        (v) => Object.keys(v).length > 0 && Object.keys(v).length <= 50,
        "Declare 1 to 50 fields",
      ),
    schedules: z
      .array(
        z
          .object({
            startsAt: PatchIdentifierSchema,
            endsAt: PatchIdentifierSchema,
          })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict()
  .superRefine((schema, ctx) => {
    for (const [name, f] of Object.entries(schema.fields)) {
      if (
        f.editable &&
        (!f.readable ||
          name === schema.key ||
          (schema.isolation.mode === "row" &&
            name === schema.isolation.tenantColumn))
      )
        ctx.addIssue({
          code: "custom",
          path: ["fields", name],
          message:
            "Editable fields must be readable and cannot be identity or Tenant columns",
        });
      if (
        f.type === "enum" &&
        (!f.values?.length || new Set(f.values).size !== f.values.length)
      )
        ctx.addIssue({
          code: "custom",
          path: ["fields", name],
          message: "Enums require unique allowed values",
        });
      if (f.type === "relation" && !f.relation)
        ctx.addIssue({
          code: "custom",
          path: ["fields", name],
          message: "Relations require an explicit scoped target",
        });
    }
    for (const [index, schedule] of schema.schedules.entries()) {
      if (
        schedule.startsAt === schedule.endsAt ||
        [schedule.startsAt, schedule.endsAt].some(
          (name) =>
            schema.fields[name]?.type !== "timestamp" ||
            !schema.fields[name]?.readable,
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["schedules", index],
          message:
            "Schedule endpoints must be distinct readable timestamp fields",
        });
    }
    for (const [name, f] of Object.entries(schema.fields))
      if (
        f.type === "timestamp" &&
        f.editable &&
        !schema.schedules.some((schedule) =>
          [schedule.startsAt, schedule.endsAt].includes(name),
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["fields", name],
          message: "Editable timestamps require an explicit schedule pair",
        });
  });
