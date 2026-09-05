import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./tests/patchctl",
  testMatch: "demo.spec.ts",
  outputDir: "./.patchctl-results/demo",
  reporter: "list",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:3108",
    browserName: "chromium",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/patchctl-demo-server.mjs",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://127.0.0.1:3108/login",
    timeout: 120000,
    reuseExistingServer: false,
  },
});
