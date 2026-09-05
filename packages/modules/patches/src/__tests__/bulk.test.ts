import { describe, expect, it, vi } from "vitest";
import { preparePatch } from "../use-cases/prepare-patch";
import { readPatchJson } from "../request-json";
import { contentSchemaInput, fingerprint } from "../content-schema";
import type { Actor } from "../access";
const sourceId = "e1bf2bb3-d983-4a69-b387-1f93124c1a24";
const actor: Actor = {
  id: "agent",
  ownerUserId: "owner",
  kind: "agent",
  tenantId: "t",
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
      description: {
        type: "text",
        readable: true,
        editable: true,
        maxLength: 100,
      },
    },
  }),
};
function setup(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    version: "b".repeat(32),
    values: { description: `Old ${i}` },
  }));
  const input = {
    sourceId,
    reason: "Update descriptions",
    schemaVersion: fingerprint(schema),
    records: rows.map((row) => ({
      id: row.id,
      version: row.version,
      changes: { description: "Current description" },
    })),
  };
  const sources = {
    find: vi.fn(async () => ({
      id: sourceId,
      tenantId: "t",
      name: "Articles",
      secretRef: "local",
      schema,
    })),
    list: vi.fn(),
    save: vi.fn(),
  };
  const patches = { create: vi.fn(), find: vi.fn(), list: vi.fn() };
  const reader = { query: vi.fn(), snapshots: vi.fn(async () => rows) };
  return {
    input,
    patches,
    reader,
    run: () =>
      preparePatch(
        input,
        actor,
        sources,
        { resolve: () => "postgresql://localhost/test" },
        reader,
        patches,
      ),
  };
}
describe("bounded bulk proposals", () => {
  it.each([1, 10, 50, 100])(
    "freezes exact IDs and counts for %i records",
    async (count) => {
      const setupResult = setup(count);
      expect(await setupResult.run()).toMatchObject({
        affectedRecords: count,
        state: "pending",
      });
      expect(
        setupResult.patches.create.mock.calls[0]?.[0].payload.records.map(
          (r: { id: string }) => r.id,
        ),
      ).toEqual(setupResult.input.records.map((r) => r.id));
      expect(setupResult.reader.query).not.toHaveBeenCalled();
    },
  );
  it.each([0, 101])(
    "rejects invalid batch size %i before reading or persisting",
    async (count) => {
      const s = setup(count);
      await expect(s.run()).rejects.toThrow();
      expect(s.reader.snapshots).not.toHaveBeenCalled();
      expect(s.patches.create).not.toHaveBeenCalled();
    },
  );
  it("supports per-record values and does not persist a partly invalid batch", async () => {
    const s = setup(50);
    s.input.records.forEach((r, i) => {
      r.changes.description = `Fresh description ${i}`;
    });
    s.input.records[49]!.changes.description = "x".repeat(101);
    await expect(s.run()).rejects.toMatchObject({
      details: { recordId: "49", field: "description" },
    });
    expect(s.patches.create).not.toHaveBeenCalled();
  });
  it("bounds streamed JSON without trusting content-length", async () => {
    await expect(
      readPatchJson(
        new Request("http://localhost", {
          method: "POST",
          body: '"' + "x".repeat(100) + '"',
        }),
        20,
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(
      await readPatchJson(
        new Request("http://localhost", {
          method: "POST",
          body: '{"title":"Hello"}',
        }),
      ),
    ).toEqual({ title: "Hello" });
    await expect(
      readPatchJson(
        new Request("http://localhost", { method: "POST", body: "invalid" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
