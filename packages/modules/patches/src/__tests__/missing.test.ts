import { describe, expect, it, vi } from "vitest";
import { preparePatch } from "../use-cases/prepare-patch";
import { contentSchemaInput, fingerprint } from "../content-schema";
import type { Actor } from "../access";
const sourceId = "e1bf2bb3-d983-4a69-b387-1f93124c1a24";
const actor: Actor = { id: "agent", ownerUserId: "owner", tenantId: "t", kind: "agent", permissions: ["read", "propose"], connectionIds: [sourceId] };
const schema = { databaseFingerprint: "a".repeat(64), definition: contentSchemaInput.parse({ table: "articles", key: "id", isolation: { mode: "row", tenantColumn: "tenant_id" }, fields: {
  summary_fr: { type: "text", readable: true, editable: false, locale: "fr" }, summary_en: { type: "text", readable: true, editable: true, nullable: true, locale: "en" },
} }) };
function setup(target: string | null) {
  const input = { sourceId, schemaVersion: fingerprint(schema), reason: "Add English translation", mode: "fill-missing", translation: { sourceField: "summary_fr", targetField: "summary_en" }, records: [{ id: "1", version: "b".repeat(32), changes: { summary_en: "Hello, world!" } }] };
  const sources = { find: vi.fn(async () => ({ id: sourceId, tenantId: "t", name: "Articles", secretRef: "local", schema })), list: vi.fn(), save: vi.fn() };
  const reader = { query: vi.fn(), snapshots: vi.fn(async () => [{ id: "1", version: "b".repeat(32), values: { summary_fr: "Bonjour, le monde !", summary_en: target } }]) };
  const patches = { create: vi.fn(), find: vi.fn(), list: vi.fn() };
  return { input, reader, patches, run: () => preparePatch(input, actor, sources, { resolve: () => "postgresql://localhost/test" }, reader, patches) };
}
describe("missing content and translation proposals", () => {
  it.each([null, "", " \t\n", "\u00a0\u2003\ufeff"])("fills a missing target while preserving source locale", async target => {
    const s = setup(target); await s.run();
    const saved = s.patches.create.mock.calls[0]?.[0];
    expect(saved.payload.records[0].after).toEqual({ summary_en: "Hello, world!" });
    expect(saved.payload.mode).toBe("fill-missing");
  });
  it("rejects already populated targets and empty replacements", async () => {
    const populated = setup("Existing translation");
    await expect(populated.run()).rejects.toMatchObject({ code: "TARGET_NOT_MISSING" });
    expect(populated.patches.create).not.toHaveBeenCalled();
    const empty = setup(null); empty.input.records[0]!.changes.summary_en = " ";
    await expect(empty.run()).rejects.toMatchObject({ code: "TARGET_NOT_MISSING" });
  });
  it("rejects source changes after the agent read and invalid locale mappings", async () => {
    const stale = setup(null); stale.input.records[0]!.version = "c".repeat(32);
    await expect(stale.run()).rejects.toMatchObject({ code: "STALE_RECORD" });
    const invalid = setup(null); invalid.input.translation.sourceField = "summary_en";
    await expect(invalid.run()).rejects.toMatchObject({ code: "INVALID_TRANSLATION" });
  });
});
