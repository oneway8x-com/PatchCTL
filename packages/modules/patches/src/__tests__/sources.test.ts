import { describe, expect, it, vi } from "vitest";
import { EnvironmentSourceSecrets } from "../postgres";
import {
  configureSource,
  listSources,
  requireSource,
} from "../use-cases/sources";
import {
  emptyLocalSourceDocument,
  listPatchctlSources,
  type LocalSourceRepository,
} from "../local-source";
import type { Actor } from "../access";
const actor: Actor = {
  id: "u",
  ownerUserId: "u",
  tenantId: "t",
  kind: "human",
  permissions: ["read", "configure"],
  connectionIds: null,
};
const source = {
  id: "existing",
  tenantId: "t",
  name: "Articles",
  secretRef: "local",
};
const secrets = new EnvironmentSourceSecrets(
  JSON.stringify({
    local: { tenantId: "t", url: "postgresql://user:password@localhost/db" },
  }),
);
describe("content source boundary", () => {
  it("resolves only explicitly configured Tenant secrets", () => {
    expect(secrets.resolve("t", "local")).toContain("postgresql:");
    expect(() => secrets.resolve("other", "local")).toThrow("unavailable");
    expect(() => secrets.resolve("t", "__proto__")).toThrow("unavailable");
    expect(() =>
      new EnvironmentSourceSecrets("invalid").resolve("t", "local"),
    ).toThrow("unavailable");
  });
  it("tests before saving and returns no secret reference or credentials", async () => {
    const repository = { save: vi.fn(), find: vi.fn(), list: vi.fn() };
    const probe = { test: vi.fn() };
    const result = await configureSource(
      { name: "Articles", secretRef: "local" },
      actor,
      repository,
      secrets,
      probe,
    );
    expect(result).toEqual({ id: expect.any(String), name: "Articles" });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t" }),
      true,
    );
    probe.test.mockRejectedValueOnce(new Error("connection failure"));
    await expect(
      configureSource(
        { name: "Articles", secretRef: "local" },
        actor,
        repository,
        secrets,
        probe,
      ),
    ).rejects.toThrow();
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
  it("does not expose unscoped sources to agents", async () => {
    const repository = {
      save: vi.fn(),
      find: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([source]),
    };
    const agent = { ...actor, kind: "agent" as const, connectionIds: [] };
    expect(await listSources(agent, repository)).toEqual([]);
    await expect(
      requireSource(agent, "existing", repository),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      requireSource(actor, "missing", repository),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      configureSource({}, agent, repository, secrets, { test: vi.fn() }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("merges hosted and local sources without losing scope or duplicates", async () => {
    const localSource = {
      id: "local-source",
      tenantId: "t",
      name: "Local database",
      document: emptyLocalSourceDocument(),
    };
    const localRepository: LocalSourceRepository = {
      provisionLocalSourceToken: vi.fn(),
      findLocalSource: vi.fn(),
      listLocalSources: vi.fn(async (_tenantId, ids) =>
        ids === null || ids.includes(localSource.id) ? [localSource] : [],
      ),
      replaceLocalSource: vi.fn(),
    };
    const hostedRepository = {
      save: vi.fn(),
      find: vi.fn(),
      list: vi
        .fn()
        .mockResolvedValue([
          source,
          { ...source, id: localSource.id, name: "Legacy duplicate" },
        ]),
    };

    await expect(
      listPatchctlSources(actor, localRepository, hostedRepository),
    ).resolves.toEqual([
      { id: "existing", name: "Articles" },
      { id: "local-source", name: "Local database" },
    ]);
    await expect(
      listPatchctlSources(
        { ...actor, kind: "agent", connectionIds: [localSource.id] },
        localRepository,
        hostedRepository,
      ),
    ).resolves.toEqual([{ id: "local-source", name: "Local database" }]);
    await expect(listPatchctlSources(actor, localRepository)).resolves.toEqual([
      { id: "local-source", name: "Local database" },
    ]);
  });
});
