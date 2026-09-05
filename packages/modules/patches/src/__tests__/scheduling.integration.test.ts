import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  contentSchemaInput,
  fingerprint,
  type RegisteredSchema,
} from "../content-schema";
import { normalizeTimestamp } from "../scheduling";
import { PostgresSchemaInspector } from "../schema.postgres";
import { PostgresContentReader } from "../content.postgres";
import { PostgresContentWriter } from "../apply.postgres";
import { preparePatch } from "../use-cases/prepare-patch";
import { decidePatch } from "../use-cases/decide-patch";
import { applyPatch } from "../use-cases/apply-patch";
import type { Actor } from "../access";
import type { Patch, ChangeValue } from "../patch";
import type { ApplyReceipt } from "../apply";
describe("explicit timestamp parsing", () => {
  it.each([
    "2026-02-30T12:00:00Z",
    "2026-09-05T12:00:00",
    "2026-09-05",
    "2026-09-05T12:00:00.123456Z",
    "infinity",
    null,
  ])("rejects invalid or ambiguous instants: %s", (value) => {
    expect(() => normalizeTimestamp(value, false, "starts_at")).toThrow();
  });
  it("distinguishes repeated DST wall times using explicit offsets", () => {
    expect(
      normalizeTimestamp("2026-10-25T02:30:00+02:00", false, "start"),
    ).toBe("2026-10-25T00:30:00.000Z");
    expect(normalizeTimestamp("2026-10-25T02:30:00+01:00", false, "end")).toBe(
      "2026-10-25T01:30:00.000Z",
    );
  });
});
const url = process.env.PATCHCTL_TEST_DATABASE_URL;
describe.skipIf(!url)("reviewed Postgres scheduling", () => {
  const tenantId = randomUUID(),
    sourceId = randomUUID(),
    namespace = `pct_schedule_${tenantId.replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url }),
    reader = new PostgresContentReader(),
    writer = new PostgresContentWriter();
  const actor: Actor = {
    id: "reviewer",
    ownerUserId: "reviewer",
    kind: "human",
    tenantId,
    permissions: ["read", "propose", "review", "apply"],
    connectionIds: null,
  };
  let schema: RegisteredSchema, saved: Patch;
  const sources = {
    find: vi.fn(async () => ({
      id: sourceId,
      tenantId,
      name: "Promotions",
      secretRef: "local",
      schema,
    })),
    list: vi.fn(),
    save: vi.fn(),
  };
  const secrets = { resolve: () => url! };
  const patches = {
    create: vi.fn(async (patch: Patch) => {
      saved = patch;
    }),
    find: vi.fn(async () => saved),
    list: vi.fn(),
    decide: vi.fn(
      async (
        _tenant: string,
        _id: string,
        _revision: string,
        reviewer: string,
        decision: "approved" | "rejected",
      ) => {
        saved.state = decision;
        saved.reviewerId = reviewer;
        saved.reviewedAt = new Date().toISOString();
        return true;
      },
    ),
    claimApply: vi.fn(async () => {
      saved.state = "applying";
      return true;
    }),
    finishApply: vi.fn(async (_patch: Patch, receipt: ApplyReceipt) => {
      saved.state = "applied";
      saved.appliedAt = receipt.appliedAt;
    }),
    failApply: vi.fn(),
  };
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test"))
      throw new Error("Isolated database required");
    await pool.query(`CREATE SCHEMA "${namespace}"`);
    await pool.query(
      `CREATE TABLE "${namespace}".promotions (id text PRIMARY KEY, tenant_id text NOT NULL, starts_at timestamptz(3), ends_at timestamptz(3), title text)`,
    );
    await pool.query(
      "CREATE TABLE IF NOT EXISTS public.patchctl_apply_receipts (tenant_id text NOT NULL, patch_id text NOT NULL, revision text NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(tenant_id,patch_id))",
    );
    const definition = contentSchemaInput.parse({
      namespace,
      table: "promotions",
      key: "id",
      isolation: { mode: "row", tenantColumn: "tenant_id" },
      fields: {
        starts_at: {
          type: "timestamp",
          readable: true,
          editable: true,
          nullable: true,
        },
        ends_at: {
          type: "timestamp",
          readable: true,
          editable: true,
          nullable: true,
        },
      },
      schedules: [{ startsAt: "starts_at", endsAt: "ends_at" }],
    });
    schema = {
      definition,
      databaseFingerprint: await new PostgresSchemaInspector().inspect(
        url,
        definition,
      ),
    };
  });
  beforeEach(async () => {
    await pool.query(`DELETE FROM "${namespace}".promotions`);
    await pool.query(
      `INSERT INTO "${namespace}".promotions VALUES ('1',$1,NULL,NULL,'Unchanged')`,
      [tenantId],
    );
  });
  afterAll(async () => {
    await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await pool.query(
      "DELETE FROM public.patchctl_apply_receipts WHERE tenant_id=$1",
      [tenantId],
    );
    await pool.end();
  });
  async function prepare(changes: Record<string, ChangeValue>) {
    const [record] = await reader.snapshots(url!, schema, tenantId, ["1"]);
    return preparePatch(
      {
        sourceId,
        schemaVersion: fingerprint(schema),
        reason: "Two-week promotion",
        records: [{ id: "1", version: record!.version, changes }],
      },
      actor,
      sources,
      secrets,
      reader,
      patches,
    );
  }
  const range = {
    starts_at: "2026-09-01T10:00:00+02:00",
    ends_at: "2026-09-15T10:00:00+02:00",
  };
  it("normalizes a two-week range before review, then applies the exact UTC values", async () => {
    const proposal = await prepare(range);
    expect(saved.payload.records[0]?.after).toEqual({
      starts_at: "2026-09-01T08:00:00.000Z",
      ends_at: "2026-09-15T08:00:00.000Z",
    });
    expect(
      (await pool.query(`SELECT starts_at FROM "${namespace}".promotions`))
        .rows[0].starts_at,
    ).toBeNull();
    await decidePatch(
      { revision: proposal.revision, decision: "approved" },
      actor,
      proposal.id,
      patches,
      sources,
    );
    await applyPatch(
      { revision: proposal.revision },
      actor,
      proposal.id,
      patches,
      sources,
      secrets,
      writer,
    );
    const [record] = await reader.snapshots(url!, schema, tenantId, ["1"]);
    expect(record?.values).toEqual(saved.payload.records[0]?.after);
    expect(patches.finishApply.mock.calls.at(-1)?.[1]).toMatchObject({
      reviewerId: "reviewer",
      records: [{ before: { starts_at: null, ends_at: null } }],
    });
  });
  it("validates a partial change against the unchanged endpoint", async () => {
    await pool.query(
      `UPDATE "${namespace}".promotions SET ends_at='2026-09-02T00:00:00Z'`,
    );
    await expect(
      prepare({ starts_at: "2026-09-03T00:00:00Z" }),
    ).rejects.toMatchObject({ code: "INVALID_SCHEDULE_RANGE" });
    await expect(
      prepare({ starts_at: "2026-09-02T00:00:00Z" }),
    ).rejects.toMatchObject({ code: "INVALID_SCHEDULE_RANGE" });
  });
  it("allows a declared open end and blocks stale records", async () => {
    const proposal = await prepare({ starts_at: range.starts_at });
    await decidePatch(
      { revision: proposal.revision, decision: "approved" },
      actor,
      proposal.id,
      patches,
      sources,
    );
    await pool.query(
      `UPDATE "${namespace}".promotions SET title='Concurrent edit'`,
    );
    await expect(
      applyPatch(
        { revision: proposal.revision },
        actor,
        proposal.id,
        patches,
        sources,
        secrets,
        writer,
      ),
    ).rejects.toMatchObject({ code: "RECORD_CONFLICT" });
    expect(
      (await pool.query(`SELECT starts_at FROM "${namespace}".promotions`))
        .rows[0].starts_at,
    ).toBeNull();
  });
  it("does not apply unapproved or rejected schedule changes", async () => {
    const proposal = await prepare(range);
    await expect(
      applyPatch(
        { revision: proposal.revision },
        actor,
        proposal.id,
        patches,
        sources,
        secrets,
        writer,
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    await decidePatch(
      { revision: proposal.revision, decision: "rejected" },
      actor,
      proposal.id,
      patches,
      sources,
    );
    await expect(
      applyPatch(
        { revision: proposal.revision },
        actor,
        proposal.id,
        patches,
        sources,
        secrets,
        writer,
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(
      (await pool.query(`SELECT starts_at FROM "${namespace}".promotions`))
        .rows[0].starts_at,
    ).toBeNull();
  });
  it("requires explicit schedule configuration and millisecond-capable timezone-aware columns", async () => {
    expect(() =>
      contentSchemaInput.parse({ ...schema.definition, schedules: [] }),
    ).toThrow();
    await pool.query(
      `ALTER TABLE "${namespace}".promotions ALTER COLUMN starts_at TYPE timestamp(3)`,
    );
    await expect(
      new PostgresSchemaInspector().inspect(url!, schema.definition),
    ).rejects.toMatchObject({ code: "INVALID_SCHEMA" });
    await pool.query(
      `ALTER TABLE "${namespace}".promotions ALTER COLUMN starts_at TYPE timestamptz(3)`,
    );
  });
});
