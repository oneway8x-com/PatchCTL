import { test, expect } from "@playwright/test";
const id = "e1bf2bb3-d983-4a69-b387-1f93124c1a24";
test.beforeEach(async ({ page }) => {
  let state = "pending";
  await page.addInitScript(() => localStorage.setItem("accessToken", "test-session"));
  await page.route("**/api/auth/me", route => route.fulfill({ json: { userId: "reviewer", email: "reviewer@example.test", activeTenantId: "tenant", memberships: [] } }));
  await page.route("**/api/patchctl/**", route => {
    const url = route.request().url();
    if (url.endsWith("/decision")) state = route.request().postDataJSON().decision;
    if (url.endsWith("/apply")) state = "applied";
    if (url.endsWith("/me")) return route.fulfill({ json: { id: "reviewer", tenantId: "tenant", kind: "human", permissions: ["read", "review", "apply"], connectionIds: null } });
    if (url.endsWith("/schema")) return route.fulfill({ json: { definition: { table: "articles", fields: { summary_en: { locale: "en" } } } } });
    if (url.includes("patches?")) return route.fulfill({ json: { items: [{ id, reason: "Add English summaries", affectedRecords: 50, state: "pending", sourceId: "source", creator: { id: "agent", kind: "agent" }, createdAt: "2026-09-05T10:00:00Z" }], nextCursor: null } });
    return route.fulfill({ json: { id, tenantId: "tenant", revision: "a".repeat(64), state, payload: {
      sourceId: "source", reason: "Add English summaries", creator: { id: "agent", kind: "agent", ownerUserId: "owner" }, createdAt: "2026-09-05T10:00:00Z",
      records: Array.from({ length: 50 }, (_, i) => ({ id: String(i + 1), before: { summary_en: i === 0 ? null : "" }, after: { summary_en: i === 0 ? '<script>window.injected=true</script>' : `English summary ${i + 1}` } })),
    } } });
  });
});
test("sends the reviewed revision and refreshes after a human decision", async ({ page }) => {
  await page.goto(`/patches/${id}`);
  const decision = page.waitForRequest(request => request.url().endsWith("/decision"));
  await page.getByRole("button", { name: "Approve and apply", exact: true }).click();
  expect((await decision).postDataJSON()).toEqual({ revision: "a".repeat(64), decision: "approved" });
  await expect(page.getByTestId("patch-state")).toHaveText("applied");
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
});
test("does not expose approval to agent credentials even with claimed review permission", async ({ page }) => {
  await page.route("**/api/patchctl/me", route => route.fulfill({ json: { id: "agent", kind: "agent", permissions: ["read", "review", "apply"] } }));
  await page.goto(`/patches/${id}`);
  await expect(page.getByText("Human review is required. Agent credentials cannot approve or apply patches.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
});
test("shows a queue entry with the exact proposed record count", async ({ page }) => {
  await page.goto("/patches");
  await expect(page.getByRole("heading", { name: "Content patches" })).toBeVisible();
  await expect(page.getByText("50 records · agent agent", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Add English summaries" }).click();
  await expect(page.getByTestId("affected-count")).toContainText("50 records affected");
});
test("distinguishes null/empty, renders content safely and paginates all records", async ({ page }) => {
  await page.goto(`/patches/${id}`);
  await expect(page.getByTestId("record-diff")).toHaveCount(10);
  await expect(page.getByText("Null (no value)", { exact: true })).toBeVisible();
  await expect(page.getByText("Empty string", { exact: true }).first()).toBeVisible();
  await expect(page.getByText('<script>window.injected=true</script>', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, "injected"))).toBe(false);
  await page.getByRole("button", { name: "Next records" }).click();
  await expect(page.getByRole("heading", { name: "Record 11", exact: true })).toBeVisible();
  await expect(page.getByText("Records 11–20 of 50", { exact: true })).toBeVisible();
  await page.screenshot({ path: "./.patchctl-results/review.png", fullPage: true });
});
