import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { contentSchemaInput, type RegisteredSchema } from "../content-schema";
import { PostgresSchemaInspector } from "../schema.postgres";
import { PostgresContentReader } from "../content.postgres";
import {
  lockAndValidateRecords,
  PostgresConflictChecker,
} from "../conflicts.postgres";
import type { PatchRecord } from "../patch";
const url = process.env.PATCHCTL_TEST_DATABASE_URL;
describe.skipIf(!url)(
  "whole-record conflicts under real Postgres locks",
  () => {
    const namespace = `pct_conflict_${randomUUID().replaceAll("-", "")}`;
    const pool = new Pool({ connectionString: url });
    let schema: RegisteredSchema;
    let records: PatchRecord[];
    beforeAll(async () => {
      if (!url || !new URL(url).pathname.endsWith("_test"))
        throw new Error("Isolated database required");
      await pool.query(`CREATE SCHEMA "${namespace}"`);
      await pool.query(
        `CREATE TABLE "${namespace}".articles (id text PRIMARY KEY, tenant_id text NOT NULL, title text NOT NULL, private text)`,
      );
      const definition = contentSchemaInput.parse({
        namespace,
        table: "articles",
        key: "id",
        isolation: { mode: "row", tenantColumn: "tenant_id" },
        fields: { title: { type: "text", readable: true, editable: true } },
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
      await pool.query(`DELETE FROM "${namespace}".articles`);
      await pool.query(
        `INSERT INTO "${namespace}".articles VALUES ('1','t','First','secret'), ('2','t','Second','secret')`,
      );
      records = (
        await new PostgresContentReader().snapshots(url!, schema, "t", [
          "1",
          "2",
        ])
      ).map((row) => ({
        id: row.id,
        version: row.version,
        before: { title: row.values.title! },
        after: { title: `New ${row.id}` },
      }));
    });
    afterAll(async () => {
      await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
      await pool.end();
    });
    it("blocks the batch after an unrelated field is edited", async () => {
      await pool.query(
        `UPDATE "${namespace}".articles SET private='changed' WHERE id='2'`,
      );
      await expect(
        new PostgresConflictChecker().check(url!, schema, "t", records),
      ).rejects.toMatchObject({
        code: "RECORD_CONFLICT",
        details: { conflicts: [{ id: "2", current: { title: "Second" } }] },
      });
      expect(
        (
          await pool.query(
            `SELECT title FROM "${namespace}".articles ORDER BY id`,
          )
        ).rows.map((r) => r.title),
      ).toEqual(["First", "Second"]);
    });
    it("treats deleted records and moved Tenant ownership as unavailable without leaking current content", async () => {
      await pool.query(`DELETE FROM "${namespace}".articles WHERE id='1'`);
      await pool.query(
        `UPDATE "${namespace}".articles SET tenant_id='other' WHERE id='2'`,
      );
      await expect(
        new PostgresConflictChecker().check(url!, schema, "t", records),
      ).rejects.toMatchObject({
        details: {
          conflicts: [
            { id: "1", current: null },
            { id: "2", current: null },
          ],
        },
      });
    });
    it("holds row locks through the caller transaction so a concurrent edit cannot pass the final check", async () => {
      const applying = await pool.connect();
      const writer = await pool.connect();
      try {
        await applying.query("BEGIN");
        await lockAndValidateRecords(applying, schema, "t", records);
        await writer.query("SET lock_timeout='100ms'");
        await expect(
          writer.query(
            `UPDATE "${namespace}".articles SET title='Racing edit' WHERE id='1'`,
          ),
        ).rejects.toMatchObject({ code: "55P03" });
      } finally {
        await applying.query("ROLLBACK");
        applying.release();
        writer.release();
      }
      await pool.query(
        `UPDATE "${namespace}".articles SET title='After lock release' WHERE id='1'`,
      );
    });
  },
);
