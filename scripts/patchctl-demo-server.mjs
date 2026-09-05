import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const port = process.env.PATCHCTL_DEMO_PORT ?? "3108";
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
  throw new Error(
    "PATCHCTL_DEMO_PORT must be an unprivileged TCP port (1024-65535).",
  );
const session = JSON.parse(
  await readFile(process.env.PATCHCTL_DEMO_SESSION, "utf8"),
);
const require = createRequire(
  new URL("../apps/app/package.json", import.meta.url),
);
const serverEnv = { ...process.env };
delete serverEnv.PATCHCTL_CONTENT_TEST_DATABASE_URL;
delete serverEnv.PATCHCTL_LOCAL_TEST_DATABASE_URL;
delete serverEnv.PATCHCTL_DATABASE_URL;
delete serverEnv.PATCHCTL_TOKEN;
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    cwd: new URL("../apps/app", import.meta.url),
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...serverEnv,
      DATABASE_URL: session.url,
      JWT_SECRET: session.jwtSecret,
      PATCHCTL_SOURCE_SECRETS: process.env.PATCHCTL_LEGACY_SERVER_CONTENT === "1" ? JSON.stringify({
        demo: { tenantId: session.tenantId, url: session.url },
      }) : "{}",
    },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
