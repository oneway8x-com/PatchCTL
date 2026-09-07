import { createHash } from "node:crypto";
import { z } from "zod";
import {
  SourceConfigurationInputSchema,
  SourceDiscoveredResourcesSchema,
  SourceEffectiveSchemaSchema,
  SourceResourceConfigurationSchema,
  SourceSchemaStateSchema,
  SourceSchemaSyncInputSchema,
  canonicalSourceResources,
  type SourceDiscoveredResource,
  type SourceResourceConfiguration,
  type SourceSchemaState,
} from "@corely/contracts";
import type { SourceRepository } from "./source";
import { publicSource } from "./source";
import { authorize, type Actor } from "./access";
import { PatchError } from "./patch.errors";

export const localPostgresProviderKey = "patchctl.local-postgres";

const storedSchema = z
  .object({
    version: z.string().regex(/^[a-f0-9]{64}$/),
    syncedAt: z.string().datetime(),
    resources: SourceDiscoveredResourcesSchema,
  })
  .strict();
const storedConfiguration = z
  .object({
    version: z.number().int().nonnegative(),
    updatedAt: z.string().datetime().nullable(),
    resources: z.array(SourceResourceConfigurationSchema).max(500),
  })
  .strict();
export const LocalSourceDocumentSchema = z
  .object({
    kind: z.literal("local-postgres"),
    version: z.literal(1),
    schema: storedSchema.nullable(),
    configuration: storedConfiguration,
  })
  .strict();
export type LocalSourceDocument = z.infer<typeof LocalSourceDocumentSchema>;
export type LocalSource = {
  id: string;
  tenantId: string;
  name: string;
  document: LocalSourceDocument;
};

export interface LocalSourceRepository {
  provisionLocalSourceToken(input: {
    tenantId: string;
    ownerUserId: string;
    keyHash: string;
    sourceId: string;
  }): Promise<void>;
  findLocalSource(
    tenantId: string,
    sourceId: string,
  ): Promise<LocalSource | null>;
  listLocalSources(
    tenantId: string,
    sourceIds: string[] | null,
  ): Promise<LocalSource[]>;
  replaceLocalSource(before: LocalSource, after: LocalSource): Promise<boolean>;
}

export function emptyLocalSourceDocument(): LocalSourceDocument {
  return {
    kind: "local-postgres",
    version: 1,
    schema: null,
    configuration: { version: 0, updatedAt: null, resources: [] },
  };
}

function schemaDigest(resources: SourceDiscoveredResource[]): string {
  return createHash("sha256")
    .update(canonicalSourceResources(resources))
    .digest("hex");
}

function findResource(
  resources: SourceDiscoveredResource[],
  resourceName: string,
): SourceDiscoveredResource | undefined {
  return resources.find((resource) => resource.name === resourceName);
}

function relationExists(
  resources: SourceDiscoveredResource[],
  relation: { resource?: string; column?: string },
): boolean {
  if (!relation.resource || !relation.column) return false;
  return Boolean(
    findResource(resources, relation.resource)?.fields.some(
      (field) => field.name === relation.column,
    ),
  );
}

function reconcileConfiguration(
  resources: SourceDiscoveredResource[],
  configuration: SourceResourceConfiguration[],
): SourceResourceConfiguration[] {
  const managedResourceNames = new Set(
    configuration.flatMap((configuredResource) => {
      const discovered = findResource(resources, configuredResource.name);
      return configuredResource.managed && discovered?.primaryKey
        ? [configuredResource.name]
        : [];
    }),
  );
  return configuration.flatMap((configuredResource) => {
    const discovered = findResource(resources, configuredResource.name);
    if (!discovered) return [];
    const managed =
      configuredResource.managed && discovered.primaryKey !== null;
    return [
      SourceResourceConfigurationSchema.parse({
        name: configuredResource.name,
        managed,
        fields: configuredResource.fields.flatMap((configuredField) => {
          const field = discovered.fields.find(
            (candidate) => candidate.name === configuredField.name,
          );
          if (!field) return [];
          const requestedRelation = configuredField.relation;
          const relationValid =
            !requestedRelation || relationExists(resources, requestedRelation);
          const semanticType =
            configuredField.semanticType === "relation" && !relationValid
              ? undefined
              : configuredField.semanticType;
          const effectiveType = semanticType ?? field.type;
          const relation = relationValid ? requestedRelation : undefined;
          const effectiveRelation =
            effectiveType === "relation"
              ? (relation ?? field.relation)
              : undefined;
          const relationTargetManaged =
            effectiveType !== "relation" ||
            Boolean(
              effectiveRelation &&
              relationExists(resources, effectiveRelation) &&
              managedResourceNames.has(effectiveRelation.resource),
            );
          const writable =
            managed &&
            configuredField.writable &&
            !field.databaseReadonly &&
            !field.primaryKey &&
            effectiveType !== "unsupported" &&
            relationTargetManaged;
          return [
            {
              name: configuredField.name,
              writable,
              ...(semanticType ? { semanticType } : {}),
              ...(semanticType === "enum" && configuredField.enumValues
                ? { enumValues: configuredField.enumValues }
                : {}),
              ...(semanticType === "relation" && relation ? { relation } : {}),
            },
          ];
        }),
      }),
    ];
  });
}

function configuredState(source: LocalSource): SourceSchemaState {
  const schema = source.document.schema;
  const configuration = source.document.configuration;
  return SourceSchemaStateSchema.parse({
    id: source.id,
    name: source.name,
    schemaVersion: schema?.version ?? null,
    syncedAt: schema?.syncedAt ?? null,
    configurationVersion: configuration.version,
    configurationUpdatedAt: configuration.updatedAt,
    resources: (schema?.resources ?? []).map((resource) => {
      const resourceConfiguration = configuration.resources.find(
        (candidate) => candidate.name === resource.name,
      );
      const managed = resourceConfiguration?.managed ?? false;
      return {
        ...resource,
        managed,
        fields: resource.fields.map((field) => {
          const fieldConfiguration = resourceConfiguration?.fields.find(
            (candidate) => candidate.name === field.name,
          );
          const semanticType = fieldConfiguration?.semanticType;
          const effectiveType = semanticType ?? field.type;
          const writable = Boolean(
            managed &&
            fieldConfiguration?.writable &&
            !field.databaseReadonly &&
            !field.primaryKey &&
            effectiveType !== "unsupported",
          );
          const effectiveEnumValues =
            effectiveType === "enum"
              ? (fieldConfiguration?.enumValues ?? field.enumValues)
              : undefined;
          const effectiveRelation =
            effectiveType === "relation"
              ? (fieldConfiguration?.relation ?? field.relation)
              : undefined;
          return {
            ...field,
            writable,
            ...(semanticType ? { semanticType } : {}),
            effectiveType,
            ...(effectiveEnumValues ? { effectiveEnumValues } : {}),
            ...(effectiveRelation ? { effectiveRelation } : {}),
          };
        }),
      };
    }),
  });
}

async function requireLocalSource(
  actor: Actor,
  repository: LocalSourceRepository,
  sourceId: string,
  permission: "read" | "propose" | "configure",
): Promise<LocalSource> {
  authorize(actor, permission, actor.tenantId, sourceId);
  const source = await repository.findLocalSource(actor.tenantId, sourceId);
  if (!source)
    throw new PatchError(404, "SOURCE_NOT_FOUND", "Source not found.");
  return source;
}

function publicLocalSource(source: LocalSource) {
  return { id: source.id, name: source.name };
}

export async function listLocalSources(
  actor: Actor,
  repository: LocalSourceRepository,
) {
  authorize(actor, "read");
  return (
    await repository.listLocalSources(actor.tenantId, actor.connectionIds)
  ).map(publicLocalSource);
}

export async function listPatchctlSources(
  actor: Actor,
  localRepository: LocalSourceRepository,
  hostedRepository?: SourceRepository,
) {
  authorize(actor, "read");
  const [local, hosted] = await Promise.all([
    localRepository.listLocalSources(actor.tenantId, actor.connectionIds),
    hostedRepository ? hostedRepository.list(actor.tenantId) : [],
  ]);
  const visibleHosted = hosted.filter(
    (source) =>
      actor.connectionIds === null || actor.connectionIds.includes(source.id),
  );
  const byId = new Map(
    [...visibleHosted.map(publicSource), ...local.map(publicLocalSource)].map(
      (source) => [source.id, source],
    ),
  );
  return [...byId.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}

export async function getLocalSourceSchema(
  actor: Actor,
  repository: LocalSourceRepository,
  sourceId: string,
) {
  return configuredState(
    await requireLocalSource(actor, repository, sourceId, "read"),
  );
}

export async function syncLocalSourceSchema(
  input: unknown,
  actor: Actor,
  repository: LocalSourceRepository,
  sourceId: string,
) {
  const parsed = SourceSchemaSyncInputSchema.parse(input);
  const source = await requireLocalSource(
    actor,
    repository,
    sourceId,
    "propose",
  );
  const expectedVersion = schemaDigest(parsed.resources);
  if (parsed.schemaVersion !== expectedVersion)
    throw new PatchError(
      400,
      "INVALID_SCHEMA_VERSION",
      "Schema fingerprint does not match the normalized schema.",
    );
  if (
    source.name === parsed.name &&
    source.document.schema?.version === parsed.schemaVersion
  )
    return { changed: false, source: configuredState(source) };

  const now = new Date().toISOString();
  const reconciled = reconcileConfiguration(
    parsed.resources,
    source.document.configuration.resources,
  );
  const configurationChanged =
    JSON.stringify(reconciled) !==
    JSON.stringify(source.document.configuration.resources);
  const next: LocalSource = {
    ...source,
    name: parsed.name,
    document: {
      ...source.document,
      schema: {
        version: parsed.schemaVersion,
        syncedAt: now,
        resources: parsed.resources,
      },
      configuration: configurationChanged
        ? {
            version: source.document.configuration.version + 1,
            updatedAt: now,
            resources: reconciled,
          }
        : source.document.configuration,
    },
  };
  if (!(await repository.replaceLocalSource(source, next)))
    throw new PatchError(
      409,
      "SOURCE_CHANGED",
      "Source configuration changed; retry discovery.",
    );
  return { changed: true, source: configuredState(next) };
}

function validateConfiguration(
  resources: SourceDiscoveredResource[],
  input: SourceResourceConfiguration[],
): void {
  for (const configuredResource of input) {
    const resource = findResource(resources, configuredResource.name);
    if (!resource)
      throw new PatchError(
        400,
        "RESOURCE_NOT_FOUND",
        "A configured resource is not present in the synchronized schema.",
      );
    if (configuredResource.managed && !resource.primaryKey)
      throw new PatchError(
        400,
        "UNSUPPORTED_PRIMARY_KEY",
        "A managed resource requires a supported primary key.",
      );
    for (const configuredField of configuredResource.fields) {
      const field = resource.fields.find(
        (candidate) => candidate.name === configuredField.name,
      );
      if (!field)
        throw new PatchError(
          400,
          "FIELD_NOT_FOUND",
          "A configured field is not present in the synchronized schema.",
        );
      const effectiveType = configuredField.semanticType ?? field.type;
      if (
        configuredField.writable &&
        (!configuredResource.managed ||
          field.databaseReadonly ||
          field.primaryKey ||
          effectiveType === "unsupported")
      )
        throw new PatchError(
          400,
          "FIELD_READONLY",
          "Only fields supported by a managed resource may be writable.",
        );
      const enumValues = configuredField.enumValues ?? field.enumValues;
      if (effectiveType === "enum" && (!enumValues || enumValues.length === 0))
        throw new PatchError(
          400,
          "INVALID_ENUM",
          "An enum field requires explicit values.",
        );
      const relation = configuredField.relation ?? field.relation;
      if (effectiveType === "relation") {
        if (!relation || !relationExists(resources, relation))
          throw new PatchError(
            400,
            "RELATION_NOT_FOUND",
            "A relation must target a synchronized resource field.",
          );
        if (
          configuredField.writable &&
          !input.some(
            (candidate) =>
              candidate.name === relation.resource && candidate.managed,
          )
        )
          throw new PatchError(
            400,
            "RELATION_NOT_MANAGED",
            "Writable relations must target a managed resource.",
          );
      }
    }
  }
}

export async function configureLocalSourceSchema(
  input: unknown,
  actor: Actor,
  repository: LocalSourceRepository,
  sourceId: string,
) {
  const parsed = SourceConfigurationInputSchema.parse(input);
  const source = await requireLocalSource(
    actor,
    repository,
    sourceId,
    "configure",
  );
  const schema = source.document.schema;
  if (!schema)
    throw new PatchError(
      409,
      "SCHEMA_NOT_SYNCED",
      "Sync the local PostgreSQL schema before configuring this source.",
    );
  if (parsed.expectedVersion !== source.document.configuration.version)
    throw new PatchError(
      409,
      "STALE_CONFIGURATION",
      "Reload the current source configuration before saving.",
    );
  validateConfiguration(schema.resources, parsed.resources);
  const now = new Date().toISOString();
  const next: LocalSource = {
    ...source,
    document: {
      ...source.document,
      configuration: {
        version: source.document.configuration.version + 1,
        updatedAt: now,
        resources: parsed.resources,
      },
    },
  };
  if (!(await repository.replaceLocalSource(source, next)))
    throw new PatchError(
      409,
      "SOURCE_CHANGED",
      "Source configuration changed; reload before saving.",
    );
  return configuredState(next);
}

export async function getEffectiveLocalSourceSchema(
  actor: Actor,
  repository: LocalSourceRepository,
  sourceId: string,
) {
  const source = await requireLocalSource(actor, repository, sourceId, "read");
  const state = configuredState(source);
  if (!state.schemaVersion)
    throw new PatchError(
      409,
      "SCHEMA_NOT_SYNCED",
      "Sync the local PostgreSQL schema before retrieving the effective schema.",
    );
  return SourceEffectiveSchemaSchema.parse({
    sourceId: source.id,
    schemaVersion: state.schemaVersion,
    configurationVersion: state.configurationVersion,
    resources: state.resources
      .filter((resource) => resource.managed)
      .map((resource) => ({
        name: resource.name,
        schemaName: resource.schemaName,
        tableName: resource.tableName,
        primaryKey: resource.primaryKey,
        fields: resource.fields.map(
          (field: (typeof resource.fields)[number]) => ({
            name: field.name,
            type: field.effectiveType,
            nullable: field.nullable,
            primaryKey: field.primaryKey,
            writable: field.writable,
            ...(field.effectiveEnumValues
              ? { enumValues: field.effectiveEnumValues }
              : {}),
            ...(field.effectiveRelation
              ? { relation: field.effectiveRelation }
              : {}),
          }),
        ),
      })),
  });
}
