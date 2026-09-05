import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { LocalProposalSchema, type LocalProposal } from "@corely/contracts";
import { createPatchctlClient, PatchctlClientError } from "@corely/api-client/patchctl";
import { discoverResources, selectedResources, requireResource, readSnapshot, validateRelation, withDatabase, LocalError } from "@patchctl/postgres";
import { configDirectory, readConfig, writeConfig } from "./config.js";
import { NativeCredentialStore, databaseCredential, type CredentialStore } from "./credentials.js";
import { hiddenSecret } from "./commands.js";
import { fingerprint, parseValue, readDraft, withDraftLock } from "./drafts.js";

export async function runServerCommand(args: string[], {
  env = process.env, stdout = process.stdout, stderr = process.stderr,
  credentials = new NativeCredentialStore(), promptToken = () => hiddenSecret("PatchCTL client token"),
}: { env?: NodeJS.ProcessEnv; stdout?: { write(value: string): unknown }; stderr?: { write(value: string): unknown }; credentials?: CredentialStore; promptToken?: () => Promise<string> } = {}): Promise<number> {
  try {
    const command = args[0];
    const rest = args.slice(1).filter((a) => a !== "--json");
    if (command === "login" ? !(rest.length === 2 && rest[0] === "--server") : rest.length !== 0)
      throw new LocalError("INVALID_INPUT", "Use login --server ORIGIN, submit, or sync.");
    const directory = configDirectory(env), config = await readConfig(directory), tenantId = config.currentTenant;
    if (!tenantId || !config.tenants[tenantId]) throw new LocalError("CREDENTIAL_NOT_FOUND", "Run patchctl connect first.");
    const local = config.tenants[tenantId];
    if (command === "login") {
      const token = env.PATCHCTL_TOKEN ?? await promptToken();
      const client = createPatchctlClient({ baseUrl: rest[1], getAccessToken: () => token });
      const actor = await client.actor();
      if (actor.kind !== "agent" || actor.connectionIds?.length !== 1 || !actor.permissions.includes("propose"))
        throw new LocalError("INVALID_TOKEN", "Use a scoped local-client token created by a human in the review UI.");
      const connectionId = z.string().uuid().parse(actor.connectionIds[0]);
      if (!env.PATCHCTL_TOKEN) await credentials.set(`${tenantId}/server-token`, token);
      local.server = { url: new URL(rest[1]).origin, tenantId: actor.tenantId, connectionId };
      await writeConfig(directory, config);
      stdout.write(JSON.stringify({ ok: true, tenantId: actor.tenantId, connectionId, warnings: env.PATCHCTL_TOKEN ? ["Using PATCHCTL_TOKEN from the environment; it was not persisted."] : [] }) + "\n");
      return 0;
    }
    const server = local.server;
    if (!server) throw new LocalError("CREDENTIAL_NOT_FOUND", "Run patchctl login --server ORIGIN first.");
    const token = env.PATCHCTL_TOKEN ?? await credentials.get(`${tenantId}/server-token`);
    if (!token) throw new LocalError("CREDENTIAL_NOT_FOUND", "Local server token is unavailable.");
    const client = createPatchctlClient({ baseUrl: server.url, getAccessToken: () => token });
    const actor = await client.actor();
    if (actor.tenantId !== server.tenantId || !actor.connectionIds?.includes(server.connectionId)) throw new LocalError("TENANT_MISMATCH", "Token does not match the configured Tenant and connection.");
    const { secret, warnings } = await databaseCredential(tenantId, credentials, env);
    if (command !== "submit") throw new LocalError("INVALID_INPUT", "Unknown server command.");
    const patch = await withDraftLock(directory, tenantId, async (save) => {
      const draft = await readDraft(directory, tenantId);
      if (!local.databaseId || draft.databaseId !== local.databaseId) throw new LocalError("DATABASE_CHANGED", "Recreate the patch for the current connection.");
      const file = join(directory, `${draft.id}-submission.json`);
      let proposal: LocalProposal;
      if (draft.status !== "DRAFT") {
        const frozen = z.object({ server: z.object({ url: z.string(), tenantId: z.string(), connectionId: z.string() }), proposal: LocalProposalSchema }).strict().parse(JSON.parse(await readFile(file, "utf8")));
        if (fingerprint(frozen.server) !== fingerprint(server)) throw new LocalError("SERVER_CHANGED", "This patch was submitted to a different server connection.");
        proposal = frozen.proposal;
      } else {
        proposal = await withDatabase(secret, async (db) => {
          const resources = selectedResources(await discoverResources(db), local.resources);
          for (const op of draft.operations) {
            const resource = requireResource(resources, op.resource);
            if (fingerprint(resource) !== op.schemaHash) throw new LocalError("SCHEMA_CHANGED", "Resource schema changed.");
            const snapshot = await readSnapshot(db, resource, op.recordId);
            if (snapshot.hash !== op.expectedVersion.snapshotHash || fingerprint(snapshot.record) !== fingerprint(op.before)) throw new LocalError("PATCH_CONFLICT", "The record changed after the proposal was prepared.");
            for (const [name, value] of Object.entries(op.after)) {
              if (value === op.before[name]) continue;
              const field = resource.fields.find((f) => f.name === name);
              if (!field) throw new LocalError("FIELD_NOT_FOUND", "Field is not selected.");
              if (parseValue(field, value === null ? "null" : String(value)) !== value) throw new LocalError("INVALID_VALUE", "Field value has an invalid type.");
              await validateRelation(db, resources, field, value);
            }
          }
          return LocalProposalSchema.parse({ id: draft.id, connectionId: server.connectionId, databaseId: local.databaseId, title: draft.title || "Content update", createdAt: draft.createdAt, operations: draft.operations,
            resources: resources.filter((r) => draft.operations.some((op) => op.resource === r.name)) });
        });
        const serialized = JSON.stringify({ server, proposal });
        if (serialized.includes(secret) || serialized.includes(token)) throw new LocalError("CREDENTIAL_IN_PATCH", "A credential was found in patch content; submission is refused.");
        if (Buffer.byteLength(serialized) > 2_000_000) throw new LocalError("PATCH_TOO_LARGE", "Patch exceeds 2 MB.");
        await writeFile(file, serialized, { flag: "wx", mode: 0o600 });
        draft.status = "SUBMITTED";
        await save(draft);
      }
      const submitted = await client.localSubmit(proposal);
      draft.status = submitted.status;
      await save(draft);
      return submitted;
    });
    stdout.write(JSON.stringify({ patchId: patch.id, status: patch.status, revision: patch.revision, reviewUrl: `${server.url}/patches/${patch.id}`, warnings }) + "\n");
    return 0;
  } catch (error) {
    const known = error instanceof LocalError || error instanceof PatchctlClientError;
    stderr.write(JSON.stringify({ ok: false, error: { code: known ? error.code : "INVALID_PATCH", message: known ? error.message : "Patch or local submission state is invalid." } }) + "\n");
    return 1;
  }
}
