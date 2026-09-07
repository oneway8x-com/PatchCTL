import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type LocalPatch } from "@corely/contracts";
import { PrismaLocalPatchRepository } from "../local-patches.repository";
import { localPostgresProviderKey, type LocalSource } from "../local-source";

const url = process.env.PATCHCTL_TEST_DATABASE_URL;

describe.skipIf(!url)("local apply-start source locking", () => {
  const tenantId = randomUUID();
  const sourceId = randomUUID();
  const patchId = randomUUID();
  const pool = new Pool({ connectionString: url });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  const repository = new PrismaLocalPatchRepository(db);
  const schemaVersion = "a".repeat(64);
  const timestamp = "2026-09-07T00:00:00.000Z";
  const source: LocalSource = {
    id: sourceId,
    tenantId,
    name: "Local database",
    document: {
      kind: "local-postgres",
      version: 1,
      schema: { version: schemaVersion, syncedAt: timestamp, resources: [] },
      configuration: { version: 1, updatedAt: timestamp, resources: [] },
    },
  };
  const approved: LocalPatch = {
    id: patchId,
    tenantId,
    revision: "b".repeat(64),
    status: "APPROVED",
    proposal: {
      id: patchId,
      connectionId: sourceId,
      databaseId: randomUUID(),
      schemaVersion,
      configurationVersion: 1,
      title: "Update article",
      createdAt: timestamp,
      operations: [
        {
          id: randomUUID(),
          resource: "public.articles",
          recordId: "1",
          operation: "UPDATE",
          before: { id: 1, title: "Before" },
          after: { id: 1, title: "After" },
          expectedVersion: { snapshotHash: "c".repeat(64) },
          schemaHash: "d".repeat(64),
        },
      ],
      resources: [
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
              readonly: true,
              pgType: "int4",
            },
            {
              name: "title",
              type: "text",
              nullable: false,
              readonly: false,
              pgType: "text",
            },
          ],
          constraints: [],
        },
      ],
    },
    creator: { id: "agent", kind: "agent" },
    reviewerId: "reviewer",
    reviewedAt: timestamp,
    appliedAt: null,
    failureCode: null,
    events: [
      {
        event: "PATCH_SUBMITTED",
        actor: { id: "agent", kind: "agent" },
        timestamp,
      },
      {
        event: "PATCH_APPROVED",
        actor: { id: "reviewer", kind: "human" },
        timestamp,
      },
    ],
  };
  const started: LocalPatch = {
    ...approved,
    events: [
      ...approved.events,
      {
        event: "PATCH_APPLY_STARTED",
        actor: { id: "agent", kind: "agent" },
        timestamp,
      },
    ],
  };
  const reconfigured: LocalSource = {
    ...source,
    document: {
      ...source.document,
      configuration: {
        version: 2,
        updatedAt: "2026-09-07T00:01:00.000Z",
        resources: [],
      },
    },
  };

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test"))
      throw new Error("Isolated database required");
    await db.tenant.create({
      data: { id: tenantId, name: "Local lock test", slug: tenantId },
    });
  });

  beforeEach(async () => {
    await db.localContentPatch.deleteMany({ where: { tenantId } });
    await db.integrationConnection.deleteMany({ where: { tenantId } });
    await db.integrationConnection.create({
      data: {
        id: source.id,
        tenantId,
        providerKey: localPostgresProviderKey,
        authMethod: "local-client",
        displayName: source.name,
        configJson: source.document as Prisma.InputJsonValue,
      },
    });
    await db.localContentPatch.create({
      data: {
        id: approved.id,
        tenantId,
        connectionId: sourceId,
        revision: approved.revision,
        status: approved.status,
        document: JSON.stringify(approved),
      },
    });
  });

  afterAll(async () => {
    await db.localContentPatch.deleteMany({ where: { tenantId } });
    await db.integrationConnection.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
    await db.$disconnect();
    await pool.end();
  });

  it("blocks configuration after apply-start commits", async () => {
    await expect(repository.startExecution(approved, started)).resolves.toBe(
      true,
    );
    await expect(
      repository.replaceLocalSource(source, reconfigured),
    ).rejects.toMatchObject({ status: 409, code: "SOURCE_BUSY" });
  });

  it("rejects apply-start after configuration commits", async () => {
    await expect(
      repository.replaceLocalSource(source, reconfigured),
    ).resolves.toBe(true);
    await expect(
      repository.startExecution(approved, started),
    ).rejects.toMatchObject({
      status: 409,
      code: "STALE_SOURCE_CONFIGURATION",
    });
    const stored = await repository.find(tenantId, patchId);
    expect(stored?.events.at(-1)?.event).toBe("PATCH_APPROVED");
  });
});
