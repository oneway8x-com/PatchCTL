import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./tests/patchctl", outputDir: "./.patchctl-results", reporter: "list", workers: 1,
  use: { baseURL: "http://127.0.0.1:3107", browserName: "chromium", screenshot: "only-on-failure" },
  webServer: { command: "pnpm --filter @corely/app dev --hostname 127.0.0.1 --port 3107",
    cwd: fileURLToPath(new URL("../../", import.meta.url)), url: "http://127.0.0.1:3107/login", timeout: 120000, reuseExistingServer: !process.env.CI },
});
