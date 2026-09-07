import { z } from "zod";

const id = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const displayName = z.string().trim().min(1).max(120);
// PostgreSQL identifiers and enum labels are exact semantic data. Validation
// must never trim or otherwise normalize quoted names or labels.
const identifier = z.string().min(1).max(256);
const resourceName = z.string().min(1).max(512);
const enumValue = z.string().max(256);

export const PatchSemanticTypeSchema = z.enum([
  "string",
  "text",
  "number",
  "boolean",
  "date",
  "datetime",
  "enum",
  "relation",
  "unsupported",
]);
export const PatchSemanticOverrideSchema = PatchSemanticTypeSchema.exclude([
  "unsupported",
]);

export const SourceRelationSchema = z
  .object({ resource: resourceName, column: identifier })
  .strict();

const sourceDiscoveredFieldBaseSchema = z
  .object({
    name: identifier,
    type: PatchSemanticTypeSchema,
    nullable: z.boolean(),
    primaryKey: z.boolean(),
    databaseReadonly: z.boolean(),
    enumValues: z.array(enumValue).max(500).optional(),
    relation: SourceRelationSchema.optional(),
  })
  .strict();

export const SourceDiscoveredFieldSchema =
  sourceDiscoveredFieldBaseSchema.superRefine((field, context) => {
    if (field.enumValues && field.type !== "enum")
      context.addIssue({
        code: "custom",
        path: ["enumValues"],
        message: "Enum values require an enum field.",
      });
    if (field.relation && field.type !== "relation")
      context.addIssue({
        code: "custom",
        path: ["relation"],
        message: "Relation metadata requires a relation field.",
      });
  });

const sourceDiscoveredResourceBaseSchema = z
  .object({
    name: resourceName,
    schemaName: identifier,
    tableName: identifier,
    primaryKey: identifier.nullable(),
    fields: z.array(SourceDiscoveredFieldSchema).max(500),
  })
  .strict();

export const SourceDiscoveredResourceSchema =
  sourceDiscoveredResourceBaseSchema.superRefine((resource, context) => {
    if (
      new Set(resource.fields.map((field) => field.name)).size !==
      resource.fields.length
    )
      context.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Field names must be unique.",
      });
    if (
      resource.primaryKey !== null &&
      !resource.fields.some(
        (field) => field.name === resource.primaryKey && field.primaryKey,
      )
    )
      context.addIssue({
        code: "custom",
        path: ["primaryKey"],
        message: "Primary key metadata is inconsistent.",
      });
  });

export const SourceDiscoveredResourcesSchema = z
  .array(SourceDiscoveredResourceSchema)
  .max(500)
  .superRefine((resources, context) => {
    if (
      new Set(resources.map((resource) => resource.name)).size !==
      resources.length
    )
      context.addIssue({
        code: "custom",
        message: "Resource names must be unique.",
      });
  });

export const SourceSchemaSyncInputSchema = z
  .object({
    name: displayName,
    schemaVersion: hash,
    resources: SourceDiscoveredResourcesSchema,
  })
  .strict();

export const SourceFieldConfigurationSchema = z
  .object({
    name: identifier,
    writable: z.boolean(),
    semanticType: PatchSemanticOverrideSchema.optional(),
    enumValues: z.array(enumValue).min(1).max(500).optional(),
    relation: SourceRelationSchema.optional(),
  })
  .strict()
  .superRefine((field, context) => {
    if (field.enumValues && field.semanticType !== "enum")
      context.addIssue({
        code: "custom",
        path: ["enumValues"],
        message: "Enum overrides require the enum semantic type.",
      });
    if (field.relation && field.semanticType !== "relation")
      context.addIssue({
        code: "custom",
        path: ["relation"],
        message: "Relation overrides require the relation semantic type.",
      });
  });

export const SourceResourceConfigurationSchema = z
  .object({
    name: resourceName,
    managed: z.boolean(),
    fields: z.array(SourceFieldConfigurationSchema).max(500),
  })
  .strict()
  .superRefine((resource, context) => {
    if (
      new Set(resource.fields.map((field) => field.name)).size !==
      resource.fields.length
    )
      context.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Field configurations must be unique.",
      });
  });

export const SourceConfigurationInputSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    resources: z.array(SourceResourceConfigurationSchema).max(500),
  })
  .strict()
  .superRefine((configuration, context) => {
    if (
      new Set(configuration.resources.map((resource) => resource.name)).size !==
      configuration.resources.length
    )
      context.addIssue({
        code: "custom",
        path: ["resources"],
        message: "Resource configurations must be unique.",
      });
  });

export const SourceConfiguredFieldSchema = sourceDiscoveredFieldBaseSchema
  .extend({
    writable: z.boolean(),
    semanticType: PatchSemanticOverrideSchema.optional(),
    effectiveType: PatchSemanticTypeSchema,
    effectiveEnumValues: z.array(enumValue).max(500).optional(),
    effectiveRelation: SourceRelationSchema.optional(),
  })
  .strict();

export const SourceConfiguredResourceSchema = sourceDiscoveredResourceBaseSchema
  .omit({ fields: true })
  .extend({
    managed: z.boolean(),
    fields: z.array(SourceConfiguredFieldSchema).max(500),
  })
  .strict();

export const SourceSchemaStateSchema = z
  .object({
    id,
    name: displayName,
    schemaVersion: hash.nullable(),
    syncedAt: z.string().datetime().nullable(),
    configurationVersion: z.number().int().nonnegative(),
    configurationUpdatedAt: z.string().datetime().nullable(),
    resources: z.array(SourceConfiguredResourceSchema).max(500),
  })
  .strict();

export const SourceSchemaSyncResultSchema = z
  .object({
    changed: z.boolean(),
    source: SourceSchemaStateSchema,
  })
  .strict();

export const SourceEffectiveFieldSchema = z
  .object({
    name: identifier,
    type: PatchSemanticTypeSchema,
    nullable: z.boolean(),
    primaryKey: z.boolean(),
    writable: z.boolean(),
    enumValues: z.array(enumValue).max(500).optional(),
    relation: SourceRelationSchema.optional(),
  })
  .strict();

export const SourceEffectiveResourceSchema = z
  .object({
    name: resourceName,
    schemaName: identifier,
    tableName: identifier,
    primaryKey: identifier.nullable(),
    fields: z.array(SourceEffectiveFieldSchema).max(500),
  })
  .strict();

export const SourceEffectiveSchemaSchema = z
  .object({
    sourceId: id,
    schemaVersion: hash,
    configurationVersion: z.number().int().nonnegative(),
    resources: z.array(SourceEffectiveResourceSchema).max(500),
  })
  .strict();

export type PatchSemanticType = z.infer<typeof PatchSemanticTypeSchema>;
export type SourceDiscoveredField = z.infer<typeof SourceDiscoveredFieldSchema>;
export type SourceDiscoveredResource = z.infer<
  typeof SourceDiscoveredResourceSchema
>;
export type SourceSchemaSyncInput = z.infer<typeof SourceSchemaSyncInputSchema>;
export type SourceFieldConfiguration = z.infer<
  typeof SourceFieldConfigurationSchema
>;
export type SourceResourceConfiguration = z.infer<
  typeof SourceResourceConfigurationSchema
>;
export type SourceConfigurationInput = z.infer<
  typeof SourceConfigurationInputSchema
>;
export type SourceSchemaState = z.infer<typeof SourceSchemaStateSchema>;
export type SourceEffectiveSchema = z.infer<typeof SourceEffectiveSchemaSchema>;

const compareExact = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

export function canonicalSourceResources(input: unknown): string {
  const resources = SourceDiscoveredResourcesSchema.parse(input)
    .map((resource) => ({
      ...resource,
      fields: resource.fields
        .map((field) => ({
          ...field,
          ...(field.enumValues
            ? { enumValues: [...field.enumValues].sort(compareExact) }
            : {}),
        }))
        .sort((left, right) => compareExact(left.name, right.name)),
    }))
    .sort((left, right) => compareExact(left.name, right.name));
  return JSON.stringify(resources);
}
