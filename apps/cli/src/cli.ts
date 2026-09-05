#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  PatchProposalInputSchema,
  ContentQueryInputSchema,
} from "@corely/contracts";

const help = `patchctl — prepare content changes for human review

Commands:
  sources
  schema SOURCE_ID
  targets SOURCE_ID FIELD [--after ID]
  read SOURCE_ID [--file query.json | --stdin] [--after ID] [--limit 50]
  validate --file patch.json | --stdin
  propose --file patch.json | --stdin
  status PATCH_ID
  history PATCH_ID [--after EVENT_ID]

All results are JSON (--json is also accepted). validate checks local structure only;
propose also verifies the live schema, permissions, record versions and values.
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
    const base = new URL(env.PATCHCTL_URL);
    if (
      (base.protocol !== "https:" &&
        !(
          base.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
        )) ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    )
      throw new CliError(
        "PATCHCTL_URL must be an HTTPS origin (HTTP is allowed on loopback for development).",
      );
    let path = "/sources",
      method = "GET";
    if (command === "schema")
      path = `/sources/${encodeURIComponent(id)}/schema`;
    if (command === "targets")
      path = `/sources/${encodeURIComponent(id)}/relations/${encodeURIComponent(field)}${options.after ? `?after=${encodeURIComponent(options.after)}` : ""}`;
    if (command === "read") {
      path = `/sources/${encodeURIComponent(id)}/records/query`;
      method = "POST";
    }
    if (command === "propose") {
      path = "/patches";
      method = "POST";
    }
    if (command === "status") path = `/patches/${encodeURIComponent(id)}`;
    if (command === "history")
      path = `/patches/${encodeURIComponent(id)}/history${options.after ? `?after=${encodeURIComponent(options.after)}` : ""}`;
    let response;
    try {
      response = await fetchImpl(new URL(`/api/patchctl${path}`, base), {
        method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${env.PATCHCTL_TOKEN}`,
          "Content-Type": "application/json",
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new CliError(
        "API request failed or timed out. No automatic retry was attempted.",
        5,
        "NETWORK_ERROR",
      );
    }
    const result: unknown = await response.json().catch(() => {
      throw new CliError("API returned invalid JSON.", 5, "INVALID_RESPONSE");
    });
    if (!response.ok)
      throw new CliError(
        isRecord(result) && typeof result.detail === "string"
          ? result.detail
          : `API returned HTTP ${response.status}.`,
        response.status === 401 || response.status === 403
          ? 3
          : response.status === 409
            ? 4
            : 5,
        isRecord(result) && typeof result.code === "string"
          ? result.code
          : "API_ERROR",
      );
    if (
      command === "propose" &&
      isRecord(result) &&
      typeof result.reviewPath === "string" &&
      result.reviewPath
    )
      result.reviewUrl = new URL(result.reviewPath, base).href;
    stdout.write(JSON.stringify(result) + "\n");
    return 0;
  } catch (error) {
    const known = error instanceof CliError;
    stderr.write(
      JSON.stringify({
        error: {
          code: known ? error.code : "INPUT_ERROR",
          message: known
            ? error.message
            : "Could not read input or configuration.",
        },
      }) + "\n",
    );
    return known ? error.exitCode : 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await run(process.argv.slice(2));
