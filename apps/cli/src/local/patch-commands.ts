import {
  LocalError,
  discoverResources,
  readSnapshot,
  requireResource,
  selectedResources,
  validateRelation,
  withDatabase,
} from "@patchctl/postgres";
import { configDirectory, readConfig } from "./config.js";
import {
  NativeCredentialStore,
  databaseCredential,
  type CredentialStore,
} from "./credentials.js";
import {
  diffDraft,
  fingerprint,
  parseValue,
  readDraft,
  startDraft,
  updateDraft,
  withDraftLock,
} from "./drafts.js";

export async function runPatchCommand(
  args: string[],
  {
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    credentials = new NativeCredentialStore(),
  }: {
    env?: NodeJS.ProcessEnv;
    stdout?: { write(value: string): unknown };
    stderr?: { write(value: string): unknown };
    credentials?: CredentialStore;
  } = {},
): Promise<number> {
  try {
    const positional: string[] = [];
    const assignments: string[] = [];
    let dryRun = false,
      title: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--json") continue;
      if (arg === "--dry-run") {
        dryRun = true;
        continue;
      }
      if (arg === "--set" || arg === "--title") {
        const value = args[++i];
        if (!value || value.startsWith("--"))
          throw new LocalError("INVALID_INPUT", "Missing option value.");
        if (arg === "--set") assignments.push(value);
        else {
          if (title !== undefined)
            throw new LocalError("INVALID_INPUT", "Duplicate title.");
          title = value;
        }
      } else if (arg.startsWith("--"))
        throw new LocalError("INVALID_INPUT", "Unknown option.");
      else positional.push(arg);
    }
    const [command, resourceName, id] = positional;
    if (
      (command === "patch" &&
        (positional.length !== 2 ||
          !["start", "status"].includes(resourceName))) ||
      (command === "update" &&
        (positional.length !== 3 || assignments.length === 0)) ||
      (["diff", "validate"].includes(command) && positional.length !== 1) ||
      (command !== "update" && (assignments.length || dryRun)) ||
      (title !== undefined &&
        !(command === "patch" && resourceName === "start"))
    )
      throw new LocalError("INVALID_INPUT", "Invalid patch command arguments.");
    const directory = configDirectory(env);
    const config = await readConfig(directory);
    const tenantId = config.currentTenant;
    if (!tenantId || !Object.hasOwn(config.tenants, tenantId))
      throw new LocalError(
        "CREDENTIAL_NOT_FOUND",
        "Run patchctl connect and init first.",
      );
    let valid = true;
    const result = await withDraftLock(directory, tenantId, async (save) => {
      if (command === "patch" && resourceName === "start") {
        try {
          const existing = await readDraft(directory, tenantId);
          if (existing.status === "DRAFT")
            throw new LocalError(
              "PATCH_ALREADY_ACTIVE",
              "An active draft already exists.",
            );
        } catch (error) {
          if (
            !(error instanceof LocalError && error.code === "NO_ACTIVE_PATCH")
          )
            throw error;
        }
        const draft = startDraft(tenantId, title);
        draft.databaseId = config.tenants[tenantId].databaseId;
        await save(draft);
        return { patch: draft };
      }
      const draft = await readDraft(directory, tenantId);
      if (draft.databaseId !== config.tenants[tenantId].databaseId) throw new LocalError("DATABASE_CHANGED", "This draft belongs to a previous connection. Recreate the draft after inspecting the new database.");
      if (command === "patch") return { patch: draft };
      if (command === "diff")
        return { patchId: draft.id, operations: diffDraft(draft) };
      const { secret, warnings } = await databaseCredential(
        tenantId,
        credentials,
        env,
      );
      return withDatabase(secret, async (client) => {
        const resources = selectedResources(
          await discoverResources(client),
          config.tenants[tenantId].resources,
        );
        if (command === "update") {
          const resource = requireResource(resources, resourceName);
          const changes = Object.fromEntries(
            assignments.map((assignment) => {
              const equals = assignment.indexOf("=");
              if (equals <= 0)
                throw new LocalError("INVALID_INPUT", "Use --set field=value.");
              const name = assignment.slice(0, equals);
              const field = resource.fields.find((f) => f.name === name);
              if (!field)
                throw new LocalError(
                  "FIELD_NOT_FOUND",
                  "Field is not selected or does not exist.",
                );
              return [name, parseValue(field, assignment.slice(equals + 1))];
            }),
          );
          if (Object.keys(changes).length !== assignments.length)
            throw new LocalError(
              "INVALID_INPUT",
              "A field can be set only once per command.",
            );
          for (const field of resource.fields)
            if (Object.hasOwn(changes, field.name))
              await validateRelation(
                client,
                resources,
                field,
                changes[field.name],
              );
          const snapshot = await readSnapshot(client, resource, id);
          const operation = updateDraft(draft, resource, id, snapshot, changes);
          if (!dryRun) await save(draft);
          return {
            valid: true,
            dryRun,
            patchId: draft.id,
            operation,
            warnings,
          };
        }
        if (command !== "validate")
          throw new LocalError("INVALID_INPUT", "Unknown patch command.");
        const errors: {
          code: string;
          resource?: string;
          recordId?: string;
          field?: string;
          message: string;
        }[] = [];
        if (!draft.operations.length)
          errors.push({
            code: "EMPTY_PATCH",
            message: "Add at least one update.",
          });
        for (const operation of draft.operations) {
          try {
            const resource = requireResource(resources, operation.resource);
            if (fingerprint(resource) !== operation.schemaHash)
              throw new LocalError(
                "SCHEMA_CHANGED",
                "Selected resource schema changed.",
              );
            const snapshot = await readSnapshot(
              client,
              resource,
              operation.recordId,
            );
            if (snapshot.hash !== operation.expectedVersion.snapshotHash)
              throw new LocalError(
                "PATCH_CONFLICT",
                "The record changed after this proposal was prepared.",
              );
            if (fingerprint(snapshot.record) !== fingerprint(operation.before))
              throw new LocalError(
                "INVALID_PATCH",
                "The stored before values do not match the record.",
              );
            if (
              Object.keys(operation.before).sort().join("\0") !==
              Object.keys(operation.after).sort().join("\0")
            )
              throw new LocalError(
                "INVALID_PATCH",
                "Before and after field sets must match.",
              );
            for (const [name, value] of Object.entries(operation.after)) {
              if (value === operation.before[name]) continue;
              const field = resource.fields.find((f) => f.name === name);
              if (!field)
                throw new LocalError(
                  "FIELD_NOT_FOUND",
                  "Field is not selected or does not exist.",
                );
              try {
                const parsed = parseValue(
                  field,
                  value === null ? "null" : String(value),
                );
                if (parsed !== value)
                  throw new LocalError(
                    "INVALID_VALUE",
                    "Value type does not match the declared field.",
                  );
                await validateRelation(client, resources, field, value);
              } catch (error) {
                if (!(error instanceof LocalError)) throw error;
                errors.push({
                  code: error.code,
                  resource: operation.resource,
                  recordId: operation.recordId,
                  field: name,
                  message: error.message,
                });
              }
            }
          } catch (error) {
            if (!(error instanceof LocalError)) throw error;
            errors.push({
              code: error.code,
              resource: operation.resource,
              recordId: operation.recordId,
              message: error.message,
            });
          }
        }
        valid = errors.length === 0;
        return { valid, errors, warnings };
      });
    });
    stdout.write(JSON.stringify(result) + "\n");
    return valid ? 0 : 1;
  } catch (error) {
    const known = error instanceof LocalError;
    stderr.write(
      JSON.stringify({
        ok: false,
        error: {
          code: known ? error.code : "LOCAL_IO_ERROR",
          message: known
            ? error.message
            : "Could not access local patch state.",
        },
      }) + "\n",
    );
    return 1;
  }
}
