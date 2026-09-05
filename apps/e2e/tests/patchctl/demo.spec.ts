import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

test("real CLI → ten English summaries → browser approval → Postgres; reject and conflict safely", async ({ page, request }) => {
  const session = JSON.parse(await readFile(process.env.PATCHCTL_DEMO_SESSION!, "utf8"));
  const pool = new Pool({ connectionString: session.url });
  async function cli(args: string[], input?: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL("../../../../packages/patchctl-cli/cli.mjs", import.meta.url)), ...args], {
        windowsHide: true, env: { ...process.env, PATCHCTL_URL: "http://127.0.0.1:3108", PATCHCTL_TOKEN: session.agentToken }, stdio: "pipe",
      });
      let output = "", error = "";
      child.stdout.on("data", chunk => output += chunk); child.stderr.on("data", chunk => error += chunk);
      child.on("error", reject); child.on("close", code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)));
      child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
    });
  }
  const rows = async () => (await pool.query(`SELECT * FROM "${session.namespace}".articles ORDER BY id`)).rows;
  try {
    await page.addInitScript(token => localStorage.setItem("accessToken", token), session.humanToken);
    const before = await rows();
    const read = await cli(["read", session.sourceId, "--stdin"], { filters: [{ field: "summary_en", op: "missing" }] });
    expect(read.records).toHaveLength(10);
    const proposal = await cli(["propose", "--stdin"], { sourceId: session.sourceId, schemaVersion: read.schemaVersion,
      mode: "fill-missing", reason: "Add English summaries to all articles missing one.", agentRunLabel: "deterministic-demo",
      records: read.records.map((record: any) => ({ id: record.id, version: record.version, changes: { summary_en: `Article ${Number(record.id)} explains safe, human-reviewed content updates.` } })) });
    expect(await rows()).toEqual(before);
    const forbidden = await request.post(`/api/patchctl/patches/${proposal.id}/decision`, { headers: { Authorization: `Bearer ${session.agentToken}` }, data: { revision: proposal.revision, decision: "approved" } });
    expect(forbidden.status()).toBe(403);
    await page.goto(proposal.reviewUrl);
    await expect(page.getByTestId("record-diff")).toHaveCount(10);
    await expect(page.getByTestId("affected-count")).toContainText("10 records affected");
    await page.screenshot({ path: "./.patchctl-results/demo/ten-proposed-updates.png", fullPage: true });
    await page.getByRole("button", { name: "Approve and apply", exact: true }).click();
    await expect(page.getByTestId("patch-state")).toHaveText("applied");
    const after = await rows();
    expect(after.slice(10)).toEqual(before.slice(10));
    for (const [index, record] of after.slice(0, 10).entries()) expect(record).toEqual({ ...before[index], summary_en: `Article ${index + 1} explains safe, human-reviewed content updates.` });
    const history = await cli(["history", proposal.id]);
    expect(history.events.map((event: any) => event.action)).toEqual(["prepared", "approved", "apply-attempt", "applied"]);
    expect(history.events.at(-1).details).toMatchObject({ reviewerId: session.userId, records: expect.any(Array) });
    for (const scenario of ["reject", "conflict"]) {
      const current = await cli(["read", session.sourceId, "--limit", "2"]);
      const next = await cli(["propose", "--stdin"], { sourceId: session.sourceId, schemaVersion: current.schemaVersion, reason: `Demo ${scenario}`,
        records: current.records.map((record: any) => ({ id: record.id, version: record.version, changes: { title: `Updated ${record.id}` } })) });
      if (scenario === "conflict") await pool.query(`UPDATE "${session.namespace}".articles SET body='Intervening human edit' WHERE id='02'`);
      const unchanged = await rows();
      await page.goto(next.reviewUrl);
      await page.getByRole("button", { name: scenario === "reject" ? "Reject patch" : "Approve and apply", exact: true }).click();
      await expect(page.getByTestId("patch-state")).toHaveText(scenario === "reject" ? "rejected" : "conflict");
      expect(await rows()).toEqual(unchanged);
    }
    // Cumulative release checks use extra fixtures only after the ten-article demo.
    for (let n = 100; n < 150; n++) await pool.query(`INSERT INTO "${session.namespace}".articles (id,tenant_id,title,body,summary_fr) VALUES ($1,$2,'Bulk article','Unchanged body','Les modifications sont vérifiées.')`, [String(n), session.tenantId]);
    const bulk = await cli(["read", session.sourceId, "--stdin"], { limit: 100, filters: [{ field: "summary_en", op: "missing" }] });
    expect(bulk.records).toHaveLength(50);
    const bulkBefore = await rows();
    const translated = await cli(["propose", "--stdin"], { sourceId: session.sourceId, schemaVersion: bulk.schemaVersion, reason: "Translate 50 French summaries into English", mode: "fill-missing", translation: { sourceField: "summary_fr", targetField: "summary_en" },
      records: bulk.records.map((record: any) => ({ id: record.id, version: record.version, changes: { summary_en: "Changes are reviewed.\nRésumé — ✓" } })) });
    expect(await rows()).toEqual(bulkBefore);
    await page.goto(translated.reviewUrl);
    await expect(page.getByTestId("affected-count")).toContainText("50 records affected");
    await page.getByRole("button", { name: "Approve and apply", exact: true }).click();
    await expect(page.getByTestId("patch-state")).toHaveText("applied");
    expect(await rows()).toEqual(bulkBefore.map(record => Number(record.id) >= 100 ? { ...record, summary_en: "Changes are reviewed.\nRésumé — ✓" } : record));
    const targets = await cli(["targets", session.sourceId, "category_id"]);
    expect(targets.targets[0]).toMatchObject({ id: "news", label: "News" });
    const one = await cli(["read", session.sourceId, "--limit", "1"]);
    const correction = await cli(["propose", "--stdin"], { sourceId: session.sourceId, schemaVersion: one.schemaVersion, reason: "Correct one title and assign placement", records: [{ id: one.records[0].id, version: one.records[0].version, changes: { title: "Corrected title — English", placement: "EARN_TOP", category_id: "news" } }] });
    const singleBefore = await rows();
    const premature = await request.post(`/api/patchctl/patches/${correction.id}/apply`, { headers: { Authorization: `Bearer ${session.humanToken}` }, data: { revision: correction.revision } });
    expect(premature.status()).toBe(409);
    const tampered = await request.post(`/api/patchctl/patches/${correction.id}/decision`, { headers: { Authorization: `Bearer ${session.humanToken}` }, data: { revision: "f".repeat(64), decision: "approved" } });
    expect(tampered.status()).toBe(409);
    expect(await rows()).toEqual(singleBefore);
    await page.goto(correction.reviewUrl);
    await expect(page.getByText(/→ News/)).toBeVisible();
    await page.getByRole("button", { name: "Approve and apply", exact: true }).click();
    await expect(page.getByTestId("patch-state")).toHaveText("applied");
    expect(await rows()).toEqual(singleBefore.map(record => record.id === "01" ? { ...record, title: "Corrected title — English", placement: "EARN_TOP", category_id: "news" } : record));
  } finally { await pool.end(); }
});
