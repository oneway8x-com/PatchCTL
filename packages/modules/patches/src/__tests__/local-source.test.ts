import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalSourceResources,
  type SourceDiscoveredResource,
} from "@corely/contracts";
import {
  configureLocalSourceSchema,
  emptyLocalSourceDocument,
  getEffectiveLocalSourceSchema,
  getLocalSourceSchema,
  listLocalSources,
  syncLocalSourceSchema,
  type Actor,
  type LocalSource,
  type LocalSourceRepository,
} from "../index";

const sourceId = "11111111-1111-4111-8111-111111111111";
const otherSourceId = "22222222-2222-4222-8222-222222222222";
const resources: SourceDiscoveredResource[] = [
  {
    name: "public.articles",
    schemaName: "public",
    tableName: "articles",
    primaryKey: "id",
    fields: [
      {
        name: "id",
        type: "number",
        nullable: false,
        primaryKey: true,
        databaseReadonly: true,
      },
      {
        name: "title",
        type: "text",
        nullable: false,
        primaryKey: false,
        databaseReadonly: false,
      },
    ],
  },
];
const fingerprint = (value: SourceDiscoveredResource[]) =>
  createHash("sha256").update(canonicalSourceResources(value)).digest("hex");
const human: Actor = {
  tenantId: "tenant-a",
  id: "owner-a",
  ownerUserId: "owner-a",
  kind: "human",
  permissions: ["read", "propose", "review", "apply", "configure"],
  connectionIds: null,
};
const agent: Actor = {
  tenantId: "tenant-a",
  id: "agent-a",
  ownerUserId: "owner-a",
  kind: "agent",
  permissions: ["read", "propose"],
  connectionIds: [sourceId],
};

class MemoryLocalSourceRepository implements LocalSourceRepository {
  readonly replace = vi.fn();
  readonly rows = new Map<string, LocalSource>();

  constructor() {
    this.rows.set(`tenant-a:${sourceId}`, {
      id: sourceId,
      tenantId: "tenant-a",
      name: "Local PostgreSQL source",
      document: emptyLocalSourceDocument(),
    });
    this.rows.set(`tenant-a:${otherSourceId}`, {
      id: otherSourceId,
      tenantId: "tenant-a",
      name: "Other source",
      document: emptyLocalSourceDocument(),
    });
  }

  async provisionLocalSourceToken() {}

  async findLocalSource(tenantId: string, id: string) {
    return this.rows.get(`${tenantId}:${id}`) ?? null;
  }

  async listLocalSources(tenantId: string, sourceIds: string[] | null) {
    return [...this.rows.values()].filter(
      (source) =>
        source.tenantId === tenantId &&
        (sourceIds === null || sourceIds.includes(source.id)),
    );
  }

  async replaceLocalSource(before: LocalSource, after: LocalSource) {
    this.replace(before, after);
    const key = `${before.tenantId}:${before.id}`;
    const current = this.rows.get(key);
    if (!current || JSON.stringify(current) !== JSON.stringify(before))
      return false;
    this.rows.set(key, structuredClone(after));
    return true;
  }
}

function syncInput(nextResources = resources) {
  return {
    name: "Editorial database",
    schemaVersion: fingerprint(nextResources),
    resources: nextResources,
  };
}

describe("local source schema metadata", () => {
  it("stores the first normalized schema, no-ops an unchanged fingerprint, and replaces a changed schema", async () => {
    const repository = new MemoryLocalSourceRepository();
    const first = await syncLocalSourceSchema(
      syncInput(),
      agent,
      repository,
      sourceId,
    );
    expect(first.changed).toBe(true);
    expect(first.source).toMatchObject({
      id: sourceId,
      name: "Editorial database",
      schemaVersion: fingerprint(resources),
      configurationVersion: 0,
    });
    expect(repository.replace).toHaveBeenCalledTimes(1);

    const unchanged = await syncLocalSourceSchema(
      syncInput(),
      agent,
      repository,
      sourceId,
    );
    expect(unchanged.changed).toBe(false);
    expect(repository.replace).toHaveBeenCalledTimes(1);

    const changedResources = structuredClone(resources);
    changedResources[0]!.fields.push({
      name: "summary",
      type: "text",
      nullable: true,
      primaryKey: false,
      databaseReadonly: false,
    });
    const changed = await syncLocalSourceSchema(
      syncInput(changedResources),
      agent,
      repository,
      sourceId,
    );
    expect(changed.changed).toBe(true);
    expect(changed.source.schemaVersion).toBe(fingerprint(changedResources));
    expect(repository.replace).toHaveBeenCalledTimes(2);
  });

  it("persists managed/writable settings and defaults newly discovered fields conservatively", async () => {
    const repository = new MemoryLocalSourceRepository();
    await syncLocalSourceSchema(syncInput(), agent, repository, sourceId);
    const configured = await configureLocalSourceSchema(
      {
        expectedVersion: 0,
        resources: [
          {
            name: "public.articles",
            managed: true,
            fields: [
              { name: "id", writable: false },
              { name: "title", writable: true, semanticType: "string" },
            ],
          },
        ],
      },
      human,
      repository,
      sourceId,
    );
    expect(configured.configurationVersion).toBe(1);
    expect(configured.resources[0]).toMatchObject({ managed: true });
    expect(
      configured.resources[0]!.fields.find((field) => field.name === "title"),
    ).toMatchObject({ writable: true, effectiveType: "string" });

    const changedResources = structuredClone(resources);
    changedResources[0]!.fields.push({
      name: "summary",
      type: "text",
      nullable: true,
      primaryKey: false,
      databaseReadonly: false,
    });
    await syncLocalSourceSchema(
      syncInput(changedResources),
      agent,
      repository,
      sourceId,
    );
    const state = await getLocalSourceSchema(human, repository, sourceId);
    expect(
      state.resources[0]!.fields.find((field) => field.name === "title"),
    ).toMatchObject({ writable: true });
    expect(
      state.resources[0]!.fields.find((field) => field.name === "summary"),
    ).toMatchObject({ writable: false });
    const effective = await getEffectiveLocalSourceSchema(
      agent,
      repository,
      sourceId,
    );
    expect(effective.resources).toHaveLength(1);
    expect(effective.resources[0]!.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "title", writable: true }),
        expect.objectContaining({ name: "summary", writable: false }),
      ]),
    );
  });

  it("revokes writable relations when their target becomes unmanaged", async () => {
    const repository = new MemoryLocalSourceRepository();
    const relationResources: SourceDiscoveredResource[] = [
      {
        ...resources[0]!,
        fields: [
          ...resources[0]!.fields,
          {
            name: "category_id",
            type: "relation",
            nullable: true,
            primaryKey: false,
            databaseReadonly: false,
            relation: { resource: "public.categories", column: "id" },
          },
        ],
      },
      {
        name: "public.categories",
        schemaName: "public",
        tableName: "categories",
        primaryKey: "id",
        fields: [
          {
            name: "id",
            type: "number",
            nullable: false,
            primaryKey: true,
            databaseReadonly: true,
          },
        ],
      },
    ];
    await syncLocalSourceSchema(
      syncInput(relationResources),
      agent,
      repository,
      sourceId,
    );
    await configureLocalSourceSchema(
      {
        expectedVersion: 0,
        resources: [
          {
            name: "public.articles",
            managed: true,
            fields: [
              { name: "id", writable: false },
              { name: "title", writable: false },
              { name: "category_id", writable: true },
            ],
          },
          {
            name: "public.categories",
            managed: true,
            fields: [{ name: "id", writable: false }],
          },
        ],
      },
      human,
      repository,
      sourceId,
    );

    const changedResources = structuredClone(relationResources);
    changedResources[1]!.primaryKey = null;
    changedResources[1]!.fields[0]!.primaryKey = false;
    await syncLocalSourceSchema(
      syncInput(changedResources),
      agent,
      repository,
      sourceId,
    );

    const state = await getLocalSourceSchema(human, repository, sourceId);
    expect(
      state.resources.find((resource) => resource.name === "public.categories")
        ?.managed,
    ).toBe(false);
    expect(
      state.resources
        .find((resource) => resource.name === "public.articles")
        ?.fields.find((field) => field.name === "category_id")?.writable,
    ).toBe(false);
  });

  it("enforces Tenant, connection, and human configuration authorization", async () => {
    const repository = new MemoryLocalSourceRepository();
    await expect(
      syncLocalSourceSchema(
        syncInput(),
        { ...agent, connectionIds: [otherSourceId] },
        repository,
        sourceId,
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(
      getLocalSourceSchema(
        { ...human, tenantId: "tenant-b" },
        repository,
        sourceId,
      ),
    ).rejects.toMatchObject({ status: 404, code: "SOURCE_NOT_FOUND" });

    await syncLocalSourceSchema(syncInput(), agent, repository, sourceId);
    await expect(
      configureLocalSourceSchema(
        { expectedVersion: 0, resources: [] },
        agent,
        repository,
        sourceId,
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(listLocalSources(agent, repository)).resolves.toEqual([
      { id: sourceId, name: "Editorial database" },
    ]);
  });

  it("rejects a client-provided fingerprint that does not match the canonical schema", async () => {
    const repository = new MemoryLocalSourceRepository();
    await expect(
      syncLocalSourceSchema(
        { ...syncInput(), schemaVersion: "0".repeat(64) },
        agent,
        repository,
        sourceId,
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_SCHEMA_VERSION",
    });
    expect(repository.replace).not.toHaveBeenCalled();
  });
});
