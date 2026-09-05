import { chromium, expect, type FullConfig } from "@playwright/test";

async function globalSetup(config: FullConfig) {
  const project = config.projects[0];
  const baseURL = project?.use?.baseURL ? String(project.use.baseURL) : "http://127.0.0.1:8080";
  const apiURL = process.env.API_URL || "http://127.0.0.1:3000";

  const response = await fetch(`${apiURL}/health`);
  expect(response.ok).toBeTruthy();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(baseURL, { waitUntil: "networkidle", timeout: 30_000 });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
