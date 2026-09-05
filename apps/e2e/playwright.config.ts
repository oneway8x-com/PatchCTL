import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const baseURL = process.env.BASE_URL || "http://127.0.0.1:8080";
const apiURL = process.env.API_URL || "http://127.0.0.1:3000";
const screenshotMode =
  process.env.E2E_SCREENSHOT_MODE === "on"
    ? "on"
    : process.env.E2E_SCREENSHOT_MODE === "off"
      ? "off"
      : "only-on-failure";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [
    ["html"],
    ["json", { outputFile: "test-results/results.json" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: screenshotMode,
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --dir ../.. dev:api",
      url: `${apiURL}/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: "pnpm --dir ../.. dev:web",
      url: baseURL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: apiURL,
      },
    },
  ],
  globalSetup: "./utils/globalSetup.ts",
  timeout: 60_000,
});
