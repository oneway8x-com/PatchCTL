import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const session = JSON.parse(
  await readFile(process.env.PATCHCTL_DEMO_SESSION, "utf8"),
);
const require = createRequire(
  new URL("../apps/app/package.json", import.meta.url),
);
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3108",
  ],
  {
    cwd: new URL("../apps/app", import.meta.url),
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: session.url,
      JWT_SECRET: session.jwtSecret,
      PATCHCTL_SOURCE_SECRETS: JSON.stringify({
        demo: { tenantId: session.tenantId, url: session.url },
      }),
    },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
