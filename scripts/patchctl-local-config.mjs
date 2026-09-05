import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";

export const localDatabaseUrl =
  "postgresql://patchctl_local:patchctl_local_only@127.0.0.1:55438/patchctl_demo";
export const localAppPort = 3109;
export const localAppUrl = `http://127.0.0.1:${localAppPort}`;

// Explicitly override both Prisma URLs: an inherited remote DIRECT_DATABASE_URL must
// never redirect local migrations. Do not load or overwrite the developer's .env files.
export function localDatabaseEnv(env) {
  return {
    ...env,
    DATABASE_URL: localDatabaseUrl,
    DIRECT_DATABASE_URL: localDatabaseUrl,
    PATCHCTL_TEST_DATABASE_URL: localDatabaseUrl,
    NODE_ENV: "development", // Keep OTP delivery local even in a production-configured shell.
    NEXT_PUBLIC_API_BASE_URL: "", // Keep browser API calls on the local app origin.
    DOCKER_CONTAINER: "1", // Prisma config skips ambient .env files.
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

export function resolveLocalSessionPath(root, sessionPath) {
  const directory = resolve(root, ".patchctl-demo");
  if (typeof sessionPath !== "string")
    throw new Error("Invalid local session path.");
  const path = resolve(root, sessionPath);
  const child = relative(directory, path);
  if (
    !child ||
    child === ".." ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  )
    throw new Error("Local session must be inside .patchctl-demo.");
  return path;
}

export function validateLocalSession(session) {
  if (
    !session ||
    session.url !== localDatabaseUrl ||
    ![
      "tenantId",
      "userId",
      "sourceId",
      "jwtSecret",
      "agentToken",
      "humanToken",
    ].every(
      (key) => typeof session[key] === "string" && session[key].length > 0,
    )
  )
    throw new Error(
      "Invalid local session. Run pnpm local:setup for this Docker database.",
    );
  return session;
}

export async function readLocalSession(root) {
  let pointer;
  try {
    pointer = JSON.parse(
      await readFile(resolve(root, ".patchctl-demo/local.json"), "utf8"),
    );
  } catch {
    throw new Error("Local setup is missing. Run pnpm local:setup first.");
  }
  const sessionPath = resolveLocalSessionPath(root, pointer.sessionPath);
  const session = validateLocalSession(
    JSON.parse(await readFile(sessionPath, "utf8")),
  );
  return { sessionPath, session };
}
