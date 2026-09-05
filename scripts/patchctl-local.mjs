import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  localAppPort,
  localAppUrl,
  localDatabaseEnv,
  readLocalSession,
  resolveLocalSessionPath,
} from "./patchctl-local-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const env = localDatabaseEnv(process.env);

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      windowsHide: true,
      stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
      ...options,
    });
    let output = "";
    if (options.capture) child.stdout.on("data", (chunk) => (output += chunk));
    const forward = (signal) => child.kill(signal);
    const interrupt = () => forward("SIGINT");
    const terminate = () => forward("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("close", (code) => {
      cleanup();
      if (code === 0) resolveRun(output);
      else
        reject(
          new Error(
            `${command === process.execPath ? "Node/pnpm" : command} exited with code ${code}.`,
          ),
        );
    });
  });
}

function pnpm(args, options) {
  if (!process.env.npm_execpath)
    throw new Error(
      "Run this helper through pnpm local:setup or pnpm local:start.",
    );
  return run(process.execPath, [process.env.npm_execpath, ...args], options);
}

function compose(args, options) {
  return run(
    "docker",
    [
      "compose",
      "--project-name",
      "patchctl-local",
      "--file",
      resolve(root, "docker-compose.patchctl.yml"),
      ...args,
    ],
    options,
  );
}

async function requireFreeAppPort() {
  await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${localAppPort} is busy. Stop the local app before setup/start.`,
        ),
      ),
    );
    server.listen(localAppPort, "127.0.0.1", () => server.close(resolvePort));
  });
}

async function startDatabase() {
  await compose(["up", "-d", "postgres"]);
  // Compatible with Docker Compose versions before `up --wait`.
  for (let attempt = 0; attempt < 30; attempt++) {
    const id = (
      await compose(["ps", "-q", "postgres"], { capture: true })
    ).trim();
    if (id) {
      const health = (
        await run(
          "docker",
          ["inspect", "--format", "{{.State.Health.Status}}", id],
          { capture: true },
        )
      ).trim();
      if (health === "healthy") return;
      if (health === "unhealthy")
        throw new Error(
          "Local Postgres is unhealthy; inspect the dedicated Compose service logs.",
        );
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  }
  throw new Error("Timed out waiting for local Postgres health.");
}

function printInfo(session) {
  console.log(`App: ${localAppUrl}/patches`);
  console.log(`Login email: ${session.userId}@example.test`);
  console.log(
    "Sign in normally; the one-time code appears only in the local app terminal.",
  );
  console.log(`Source ID: ${session.sourceId}`);
  console.log(
    "Seed includes ten articles initially missing English summaries, plus populated and other-Tenant controls.",
  );
  console.log(
    "Agent credentials expire one hour after setup. Re-run setup with the app stopped for a fresh dataset.",
  );
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (action === "setup") {
    await requireFreeAppPort();
    console.log(
      "Preparing only patchctl-local Postgres on 127.0.0.1:55438 / patchctl_demo.",
    );
    await startDatabase();
    await pnpm(["prisma:generate"]);
    await pnpm([
      "--filter",
      "@corely/data",
      "exec",
      "prisma",
      "migrate",
      "deploy",
    ]);
    await pnpm(["build:packages"]);
    const result = JSON.parse(
      await pnpm(["exec", "tsx", "scripts/patchctl-demo.ts"], {
        capture: true,
      }),
    );
    const sessionPath = resolveLocalSessionPath(root, result.sessionPath);
    await writeFile(
      resolve(root, ".patchctl-demo/local.json"),
      JSON.stringify({
        sessionPath: relative(root, sessionPath),
      }),
      { mode: 0o600 },
    );
    printInfo((await readLocalSession(root)).session);
    console.log(
      "Ready. Run pnpm local:start in a terminal and leave it running.",
    );
  } else if (action === "start") {
    const { sessionPath, session } = await readLocalSession(root);
    await requireFreeAppPort();
    await startDatabase();
    printInfo(session);
    await run(process.execPath, ["scripts/patchctl-demo-server.mjs"], {
      env: {
        ...env,
        PATCHCTL_DEMO_SESSION: sessionPath,
        PATCHCTL_DEMO_PORT: String(localAppPort),
      },
    });
  } else if (action === "info") {
    printInfo((await readLocalSession(root)).session);
  } else if (action === "agent") {
    const { session } = await readLocalSession(root);
    // Only the scoped agent credential is forwarded, never the fixture's human token.
    const agentEnv = {
      ...process.env,
      PATCHCTL_URL: localAppUrl,
      PATCHCTL_TOKEN: session.agentToken,
    };
    for (const key of [
      "DATABASE_URL",
      "DIRECT_DATABASE_URL",
      "PATCHCTL_TEST_DATABASE_URL",
      "JWT_SECRET",
      "PATCHCTL_SOURCE_SECRETS",
      "PATCHCTL_DEMO_SESSION",
    ])
      delete agentEnv[key];
    await run(
      process.execPath,
      [
        "packages/patchctl-cli/cli.mjs",
        ...args.filter((arg, index) => !(index === 0 && arg === "--")),
      ],
      { env: agentEnv },
    );
  } else if (action === "stop") {
    // Stop only this Compose database. Do not delete containers, volumes, or seeded data.
    await compose(["stop", "postgres"]);
  } else {
    throw new Error("Expected setup, start, info, agent, or stop.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
