import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./tests/patchctl",
  testMatch: "review.spec.ts",
  outputDir: "./.patchctl-results",
  reporter: "list",
  workers: 1,
  expect: { timeout: 15000 },
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3107",
    browserName: "chromium",
    screenshot: "only-on-failure",
  },
  webServer: {
    env: { PATCHCTL_LEGACY_SERVER_CONTENT: "1" },
    command: "pnpm --filter @corely/app dev --hostname 127.0.0.1 --port 3107",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://127.0.0.1:3107/login",
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
