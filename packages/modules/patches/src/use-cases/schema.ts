import { authorize, type Actor } from "../access";
import {
  contentSchemaInput,
  fingerprint,
  registeredSchema,
  type SchemaInspector,
} from "../content-schema";
import type { SourceRepository, SourceSecrets } from "../source";
import { requireSource } from "./sources";
import { PatchError } from "../patch.errors";

export async function configureSchema(
  input: unknown,
  actor: Actor,
  sourceId: string,
  repository: SourceRepository,
  secrets: SourceSecrets,
  inspector: SchemaInspector,
) {
  authorize(actor, "configure");
  const source = await requireSource(actor, sourceId, repository);
  const definition = contentSchemaInput.parse(input);
  if (
    definition.isolation.mode === "dedicated" &&
    definition.isolation.dedicatedTenantId !== actor.tenantId
  )
    throw new PatchError(
      403,
      "TENANT_MISMATCH",
      "Dedicated sources must belong to the active Tenant.",
    );
  const databaseFingerprint = await inspector.inspect(
    secrets.resolve(actor.tenantId, source.secretRef),
    definition,
  );
  await repository.save(
    { ...source, schema: { definition, databaseFingerprint } },
    false,
  );
  return {
    definition,
    version: fingerprint({ definition, databaseFingerprint }),
  };
}
export async function getContentSchema(
  actor: Actor,
  sourceId: string,
  repository: SourceRepository,
) {
  const source = await requireSource(actor, sourceId, repository);
  const registered = registeredSchema(source.schema);
  const { fields, ...definition } = registered.definition;
  return {
    definition: {
      ...definition,
      fields: Object.fromEntries(
        Object.entries(fields).filter(([, field]) => field.readable),
      ),
    },
    version: fingerprint(registered),
    versionStrategy: "postgres-xmin-and-whole-row",
  };
}
