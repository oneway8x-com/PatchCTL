import {
  createPatchctlClient,
  PatchctlClientError,
  type PatchctlClient,
} from "@corely/api-client/patchctl";
import {
  applyEffectiveSchema,
  normalizeDiscoveredResources,
  selectedResources,
  LocalError,
  type Resource,
} from "@patchctl/postgres";
import type { LocalConfig } from "./config.js";
import type { CredentialStore } from "./credentials.js";

export type LocalTenant = LocalConfig["tenants"][string];

async function pairedClient(
  tenantId: string,
  local: LocalTenant,
  credentials: CredentialStore,
  env: NodeJS.ProcessEnv,
  fetchImpl?: typeof fetch,
): Promise<PatchctlClient> {
  if (!local.server)
    throw new LocalError(
      "SERVER_NOT_CONFIGURED",
      "Run patchctl login --server ORIGIN first.",
    );
  const token =
    env.PATCHCTL_TOKEN ?? (await credentials.get(`${tenantId}/server-token`));
  if (!token)
    throw new LocalError(
      "CREDENTIAL_NOT_FOUND",
      "Local server token is unavailable.",
    );
  return createPatchctlClient({
    baseUrl: local.server.url,
    getAccessToken: () => token,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

export async function syncAndResolveResources(
  tenantId: string,
  local: LocalTenant,
  discovered: Resource[],
  credentials: CredentialStore,
  env: NodeJS.ProcessEnv,
  fetchImpl?: typeof fetch,
): Promise<{
  resources: Resource[];
  schemaVersion: string | null;
  configurationVersion: number | null;
  synced: boolean;
  configurationUrl: string | null;
}> {
  if (!local.server)
    return {
      resources: selectedResources(discovered, local.resources),
      schemaVersion: null,
      configurationVersion: null,
      synced: false,
      configurationUrl: null,
    };
  try {
    const client = await pairedClient(
      tenantId,
      local,
      credentials,
      env,
      fetchImpl,
    );
    const normalized = normalizeDiscoveredResources(discovered);
    const result = await client.syncSourceMetadata(local.server.connectionId, {
      name: local.source.name,
      schemaVersion: normalized.schemaVersion,
      resources: normalized.resources,
    });
    const effective = await client.effectiveSourceSchema(
      local.server.connectionId,
    );
    const serverResources = applyEffectiveSchema(discovered, effective);
    return {
      resources:
        local.resources.length > 0
          ? selectedResources(serverResources, local.resources)
          : serverResources,
      schemaVersion: effective.schemaVersion,
      configurationVersion: effective.configurationVersion,
      synced: result.changed,
      configurationUrl: `${local.server.url}/sources/${encodeURIComponent(local.server.connectionId)}`,
    };
  } catch (error) {
    if (error instanceof LocalError) throw error;
    if (error instanceof PatchctlClientError)
      throw new LocalError(error.code, error.message);
    throw new LocalError(
      "SCHEMA_SYNC_FAILED",
      "Could not synchronize or retrieve PatchCTL source configuration.",
    );
  }
}

export async function syncWithClient(
  local: LocalTenant,
  discovered: Resource[],
  client: PatchctlClient,
) {
  if (!local.server)
    throw new LocalError(
      "SERVER_NOT_CONFIGURED",
      "Run patchctl login --server ORIGIN first.",
    );
  const normalized = normalizeDiscoveredResources(discovered);
  const result = await client.syncSourceMetadata(local.server.connectionId, {
    name: local.source.name,
    schemaVersion: normalized.schemaVersion,
    resources: normalized.resources,
  });
  return {
    ...result,
    discoveredResources: normalized.resources.length,
    configurationUrl: `${local.server.url}/sources/${encodeURIComponent(local.server.connectionId)}`,
  };
}
