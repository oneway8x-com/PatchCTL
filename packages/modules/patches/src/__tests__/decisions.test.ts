import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "../access";
import type { Patch } from "../patch";
import { decidePatch } from "../use-cases/decide-patch";
import { contentSchemaInput, fingerprint } from "../content-schema";
const actor: Actor = {
  id: "reviewer",
  ownerUserId: "reviewer",
  tenantId: "tenant",
  kind: "human",
  permissions: ["read", "review"],
  connectionIds: null,
};
const id = "e1bf2bb3-d983-4a69-b387-1f93124c1a24";
const schema = {
  definition: contentSchemaInput.parse({
    table: "articles",
    key: "id",
    isolation: { mode: "row", tenantColumn: "tenant_id" },
    fields: { title: { type: "text", readable: true, editable: true } },
  }),
  databaseFingerprint: "a".repeat(64),
};
const sources = {
  find: vi.fn().mockResolvedValue({
    id: "source",
    tenantId: "tenant",
    name: "Articles",
    secretRef: "test",
    schema,
  }),
  list: vi.fn(),
  save: vi.fn(),
};
let patch: Patch;
const repository = {
  create: vi.fn(),
  find: vi.fn(),
  list: vi.fn(),
  decide: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  patch = {
    id,
    tenantId: "tenant",
    revision: "",
    state: "pending",
    reviewerId: null,
    reviewedAt: null,
    rejectionReason: null,
    failureCode: null,
    appliedAt: null,
    payload: {
      sourceId: "source",
      schemaVersion: fingerprint(schema),
      sourceFingerprint: "b".repeat(64),
      reason: "Fix",
      createdAt: new Date().toISOString(),
      creator: { id: "agent", kind: "agent", ownerUserId: "owner" },
      records: [
        {
          id: "1",
          version: "a".repeat(32),
          before: { title: "Before" },
          after: { title: "After" },
        },
      ],
    },
  };
  patch.revision = fingerprint({
    tenantId: patch.tenantId,
    payload: patch.payload,
  });
  repository.find.mockImplementation(async () => patch);
  repository.decide.mockImplementation(
    async (_tenant, _id, _revision, reviewer, decision, reason) => {
      if (patch.state !== "pending") return false;
      patch.state = decision;
      patch.reviewerId = reviewer;
      patch.rejectionReason = reason;
      return true;
    },
  );
});
describe("exact-revision human decisions", () => {
  it.each(["approved", "rejected"] as const)(
    "records the authenticated reviewer for %s",
    async (decision) => {
      const result = await decidePatch(
        { revision: patch.revision, decision, reason: "Needs work" },
        actor,
        id,
        repository,
        sources,
      );
      expect(result.state).toBe(decision);
      expect(result.reviewerId).toBe("reviewer");
    },
  );
  it("rejects agents before any repository access", async () => {
    await expect(
      decidePatch({}, { ...actor, kind: "agent" }, id, repository, sources),
    ).rejects.toMatchObject({ status: 403 });
    expect(repository.find).not.toHaveBeenCalled();
  });
  it("rejects stale revisions, forged identity and tampered payloads", async () => {
    await expect(
      decidePatch(
        { revision: "b".repeat(64), decision: "approved" },
        actor,
        id,
        repository,
        sources,
      ),
    ).rejects.toMatchObject({ code: "STALE_REVIEW" });
    await expect(
      decidePatch(
        { revision: patch.revision, decision: "approved", reviewerId: "admin" },
        actor,
        id,
        repository,
        sources,
      ),
    ).rejects.toThrow();
    patch.payload.records[0]!.after.title = "Tampered";
    await expect(
      decidePatch(
        { revision: patch.revision, decision: "approved" },
        actor,
        id,
        repository,
        sources,
      ),
    ).rejects.toMatchObject({ code: "STALE_REVIEW" });
    expect(repository.decide).not.toHaveBeenCalled();
  });
  it("only one of two competing decisions succeeds", async () => {
    const revision = patch.revision;
    const results = await Promise.allSettled([
      decidePatch(
        { revision, decision: "approved" },
        actor,
        id,
        repository,
        sources,
      ),
      decidePatch(
        { revision, decision: "rejected" },
        actor,
        id,
        repository,
        sources,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});
