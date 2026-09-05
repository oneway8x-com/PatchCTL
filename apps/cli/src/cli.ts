#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { localCommands, runLocal } from "./local/commands.js";
import { configDirectory, readConfig } from "./local/config.js";
import { runPatchCommand } from "./local/patch-commands.js";
import { runServerCommand } from "./local/server-commands.js";
import {
  PatchProposalInputSchema,
  ContentQueryInputSchema,
} from "@corely/contracts";
import {
  createPatchctlClient,
  PatchctlClientError,
} from "@corely/api-client/patchctl";

const help = `patchctl — prepare content changes for human review

Commands:
  connect [--tenant NAME]
  init --resources public.articles --columns id,title
  resources
  schema [RESOURCE]
  list RESOURCE [--limit 20]
  get RESOURCE ID
  agent-guide
  patch start [--title TITLE]
  patch status
  update RESOURCE ID --set field=value [--dry-run]
  diff
  validate
  login --server ORIGIN
  submit
  sync

Legacy server commands (schema uses local configuration when connected):
  sources
  schema SOURCE_ID
  targets SOURCE_ID FIELD [--after ID]
  read SOURCE_ID [--file query.json | --stdin] [--after ID] [--limit 50]
  validate --file patch.json | --stdin
  propose --file patch.json | --stdin
  status PATCH_ID
  history PATCH_ID [--after EVENT_ID]

All results are JSON (--json is also accepted). Local validate checks the active draft
against PostgreSQL. Legacy validate --file/--stdin checks local structure only;
legacy propose also verifies the server-side schema, permissions and record values.
Set PATCHCTL_URL to the service origin and PATCHCTL_TOKEN to a scoped agent key.
Source content changes only after human review in the returned review URL.
`;
class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 2,
    public readonly code = "INVALID_INPUT",
  ) {
    super(message);
  }
}
type Options = {
  json?: boolean;
  stdin?: boolean;
  help?: boolean;
  file?: string;
  after?: string;
  limit?: string;
};
type InputStream = AsyncIterable<string | Uint8Array>;
type OutputStream = { write(text: string): unknown };
type RunOptions = {
  env?: NodeJS.ProcessEnv;
  stdin?: InputStream;
  stdout?: OutputStream;
  stderr?: OutputStream;
  fetchImpl?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse(args: string[]) {
  const positionals: string[] = [];
  const options: Options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "json" || key === "stdin" || key === "help") {
      options[key] = true;
      continue;
    }
    if (
      (key !== "file" && key !== "after" && key !== "limit") ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new CliError("Unknown option or missing option value.");
    if (options[key] !== undefined) throw new CliError("Duplicate option.");
    options[key] = args[++i];
  }
  if (options.file && options.stdin)
    throw new CliError("Use --file or --stdin, not both.");
  return { positionals, options };
}
async function inputJSON(
  options: Options,
  stdin: InputStream,
): Promise<unknown> {
  let text = "";
  if (options.file) {
    if ((await stat(options.file)).size > 2_000_000)
      throw new CliError("Input exceeds 2 MB.");
    text = await readFile(options.file, "utf8");
  } else if (options.stdin) {
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    for await (const chunk of stdin) {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      bytes += buffer.length;
      if (bytes > 2_000_000) throw new CliError("Input exceeds 2 MB.");
      chunks.push(buffer);
    }
    text = Buffer.concat(chunks).toString("utf8");
  } else return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError("Input is not valid JSON.");
  }
}
export async function run(
  args: string[],
  {
    env = process.env,
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    fetchImpl = fetch,
  }: RunOptions = {},
): Promise<number> {
  try {
    if (!args.includes("--help") && ["login", "submit", "sync"].includes(args[0])) return runServerCommand(args, { env, stdout, stderr });
    if (
      !args.includes("--help") &&
      (["patch", "update", "diff"].includes(args[0]) ||
        (args[0] === "validate" &&
          !args.includes("--file") &&
          !args.includes("--stdin")))
    )
      return runPatchCommand(args, { env, stdout, stderr });
    if (
      !args.includes("--help") &&
      (localCommands.includes(args[0]) ||
        (args[0] === "schema" &&
          Boolean((await readConfig(configDirectory(env))).currentTenant)))
    )
      return runLocal(args, { env, stdout, stderr });
    const { positionals, options } = parse(args);
    const [command, id, field] = positionals;
    if (!command || options.help) {
      stdout.write(help);
      return 0;
    }
    if (
      ![
        "sources",
        "schema",
        "targets",
        "read",
        "validate",
        "propose",
        "status",
        "history",
      ].includes(command)
    )
      throw new CliError("Unknown command. Run patchctl --help.");
    const needsId = ["schema", "read", "status", "history"].includes(command);
    if (
      positionals.length !== (command === "targets" ? 3 : needsId ? 2 : 1) ||
      (needsId && !id)
    )
      throw new CliError("Invalid command arguments.");
    if (
      (options.file || options.stdin) &&
      !["read", "validate", "propose"].includes(command)
    )
      throw new CliError("This command does not accept JSON input.");
    if (
      (options.after && !["read", "history", "targets"].includes(command)) ||
      (options.limit && command !== "read")
    )
      throw new CliError(
        "Pagination options are not supported for this command.",
      );
    let body: unknown;
    if (["validate", "propose", "read"].includes(command)) {
      if (command !== "read" && !options.file && !options.stdin)
        throw new CliError("Provide a proposal with --file or --stdin.");
      body = await inputJSON(options, stdin);
      if (command === "read" && !isRecord(body))
        throw new CliError("Read query must be a JSON object.");
      const parsed =
        command === "read"
          ? ContentQueryInputSchema.safeParse({
              ...(isRecord(body) ? body : {}),
              ...(options.after ? { after: options.after } : {}),
              ...(options.limit ? { limit: Number(options.limit) } : {}),
            })
          : PatchProposalInputSchema.safeParse(body);
      if (!parsed.success)
        throw new CliError(
          `Validation failed: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
        );
      body = parsed.data;
      if (command === "validate") {
        stdout.write(
          JSON.stringify({
            valid: true,
            validation: "local-structure-only",
            affectedRecords:
              PatchProposalInputSchema.parse(body).records.length,
          }) + "\n",
        );
        return 0;
      }
    }
    if (!env.PATCHCTL_URL || !env.PATCHCTL_TOKEN)
      throw new CliError(
        "Set PATCHCTL_URL and PATCHCTL_TOKEN before API commands.",
        3,
        "AUTH_CONFIGURATION",
      );
    const client = createPatchctlClient({
      baseUrl: env.PATCHCTL_URL,
      getAccessToken: () => env.PATCHCTL_TOKEN,
      fetch: fetchImpl,
    });
    let result: unknown;
    switch (command) {
      case "sources":
        result = await client.sources();
        break;
      case "schema":
        result = await client.schema(id);
        break;
      case "targets":
        result = await client.targets(id, field, options.after);
        break;
      case "read":
        result = await client.read(id, ContentQueryInputSchema.parse(body));
        break;
      case "propose":
        result = await client.propose(PatchProposalInputSchema.parse(body));
        break;
      case "status":
        result = await client.patch(id);
        break;
      case "history":
        result = await client.history(id, { after: options.after });
        break;
    }
    stdout.write(JSON.stringify(result) + "\n");
    return 0;
  } catch (error) {
    const failure =
      error instanceof PatchctlClientError
        ? new CliError(
            error.message,
            error.status === 401 ||
              error.status === 403 ||
              error.code === "AUTH_CONFIGURATION"
              ? 3
              : error.status === 409
                ? 4
                : error.code === "INVALID_INPUT"
                  ? 2
                  : 5,
            error.code,
          )
        : error;
    const known = failure instanceof CliError;
    stderr.write(
      JSON.stringify({
        error: {
          code: known ? failure.code : "INPUT_ERROR",
          message: known
            ? failure.message
            : "Could not read input or configuration.",
        },
      }) + "\n",
    );
    return known ? failure.exitCode : 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await run(process.argv.slice(2));
