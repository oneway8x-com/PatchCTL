import { beforeEach, describe, expect, it, vi } from "vitest";
import { preparePatch } from "../use-cases/prepare-patch";
import { contentSchemaInput, fingerprint } from "../content-schema";
import type { Actor } from "../access";
import type { Patch } from "../patch";
const sourceId = "e1bf2bb3-d983-4a69-b387-1f93124c1a24";
const actor: Actor = {
  id: "agent",
  ownerUserId: "owner",
  kind: "agent",
  tenantId: "tenant",
  permissions: ["read", "propose"],
  connectionIds: [sourceId],
};
const schema = {
  databaseFingerprint: "a".repeat(64),
  definition: contentSchemaInput.parse({
    table: "articles",
    key: "id",
    isolation: { mode: "row", tenantColumn: "tenant_id" },
    fields: {
      title: { type: "text", readable: true, editable: true, maxLength: 20 },
      summary_en: {
        type: "text",
        readable: true,
        editable: true,
        nullable: true,
      },
      body: { type: "text", readable: true, editable: false },
    },
  }),
};
const version = "a".repeat(32);
const sources = {
  find: vi.fn().mockResolvedValue({
    id: sourceId,
    tenantId: "tenant",
    secretRef: "source",
    name: "Articles",
    schema,
  }),
  list: vi.fn(),
  save: vi.fn(),
};
const secrets = { resolve: () => "postgresql://secret:password@localhost/db" };
const reader = { query: vi.fn(), snapshots: vi.fn() };
const patches = { create: vi.fn(), find: vi.fn(), list: vi.fn() };
const input = () => ({
  sourceId,
  schemaVersion: fingerprint(schema),
  reason: "Fix typo",
  records: [{ id: "1", version, changes: { title: "Correct title" } }],
});
beforeEach(() => {
  vi.clearAllMocks();
  reader.snapshots.mockResolvedValue([
    {
      id: "1",
      version,
      values: { title: "Typo", summary_en: null, body: "Source" },
    },
  ]);
});
describe("immutable prepared patches", () => {
  it("stores server-verified before values and authenticated provenance without source writes", async () => {
    const result = await preparePatch(
      input(),
      actor,
      sources,
      secrets,
      reader,
      patches,
    );
    const saved = patches.create.mock.calls[0]?.[0] as Patch;
    expect(result.state).toBe("pending");
    expect(saved.payload.records[0]).toMatchObject({
      before: { title: "Typo" },
      after: { title: "Correct title" },
    });
    expect(saved.payload.creator).toEqual({
      id: "agent",
      kind: "agent",
      ownerUserId: "owner",
    });
    expect(saved.revision).toBe(
      fingerprint({ tenantId: "tenant", payload: saved.payload }),
    );
    expect(JSON.stringify(saved)).not.toContain("password");
    expect(sources.save).not.toHaveBeenCalled();
  });
  it("rejects stale and unavailable records before persisting anything", async () => {
    reader.snapshots.mockResolvedValueOnce([]);
    await expect(
      preparePatch(input(), actor, sources, secrets, reader, patches),
    ).rejects.toMatchObject({ code: "STALE_RECORD" });
    const stale = input();
    stale.records[0]!.version = "b".repeat(32);
    await expect(
      preparePatch(stale, actor, sources, secrets, reader, patches),
    ).rejects.toMatchObject({ code: "STALE_RECORD" });
    expect(patches.create).not.toHaveBeenCalled();
  });
  it.each([
    { body: "overwrite" },
    { private: "hidden" },
    { title: "Typo" },
    { title: null },
    { title: 12 },
    { title: "x".repeat(21) },
  ])("rejects forbidden, no-op or invalid values", async (changes) => {
    await expect(
      preparePatch(
        { ...input(), records: [{ id: "1", version, changes }] },
        actor,
        sources,
        secrets,
        reader,
        patches,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(patches.create).not.toHaveBeenCalled();
  });
  it("rejects duplicate records and forged provenance", async () => {
    const duplicate = input();
    duplicate.records.push(duplicate.records[0]!);
    await expect(
      preparePatch(duplicate, actor, sources, secrets, reader, patches),
    ).rejects.toMatchObject({ code: "DUPLICATE_RECORD" });
    await expect(
      preparePatch(
        { ...input(), creator: "admin" },
        actor,
        sources,
        secrets,
        reader,
        patches,
      ),
    ).rejects.toThrow();
  });
  it("preserves Unicode and line breaks in a missing summary", async () => {
    await preparePatch(
      {
        ...input(),
        records: [
          {
            id: "1",
            version,
            changes: { summary_en: "Résumé\nEnglish summary — 你好" },
          },
        ],
      },
      actor,
      sources,
      secrets,
      reader,
      patches,
    );
    expect(
      patches.create.mock.calls[0]?.[0].payload.records[0].after.summary_en,
    ).toBe("Résumé\nEnglish summary — 你好");
  });
});
