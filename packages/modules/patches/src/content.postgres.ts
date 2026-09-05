import { sourcePool } from "./postgres";
import {
  fingerprint,
  quoteIdentifier as q,
  tableName,
  type ContentSchema,
  type RegisteredSchema,
} from "./content-schema";
import { inspectSchema } from "./schema.postgres";
import { PatchError } from "./patch.errors";
import type {
  ContentReader,
  ContentQuery,
  ContentPage,
  ContentRecord,
} from "./content";
import type { PoolClient } from "pg";
import { textWhitespace } from "./missing-text";

export function rowProjection(schema: ContentSchema, fields: string[]) {
  const pairs = fields
    .flatMap((name) => [
      `'${q(name).slice(1, -1)}'`,
      schema.fields[name]?.type === "timestamp"
        ? `CASE WHEN isfinite(r.${q(name)}) THEN to_char(r.${q(name)} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE r.${q(name)}::text END`
        : `r.${q(name)}${schema.fields[name]?.type === "relation" ? "::text" : ""}`,
    ])
    .join(",");
  return `r.${q(schema.key)}::text AS id, md5(to_jsonb(r)::text || ':' || r.xmin::text) AS version,
    jsonb_build_object(${pairs}) AS values`;
}
export function rowScope(
  schema: ContentSchema,
  tenantId: string,
  values: unknown[],
) {
  if (schema.isolation.mode === "dedicated") {
    if (schema.isolation.dedicatedTenantId !== tenantId)
      throw new PatchError(
        403,
        "TENANT_MISMATCH",
        "Source belongs to another Tenant.",
      );
    return "TRUE";
  }
  values.push(tenantId);
  return `r.${q(schema.isolation.tenantColumn)}::text = $${values.length}`;
}
export async function assertSchema(
  client: PoolClient,
  registered: RegisteredSchema,
) {
  const observed = await inspectSchema(client, registered.definition);
  if (observed !== registered.databaseFingerprint)
    throw new PatchError(
      409,
      "SCHEMA_CHANGED",
      "The content schema changed; configure it again before preparing a patch.",
    );
}
export async function readSnapshots(
  client: PoolClient,
  registered: RegisteredSchema,
  tenantId: string,
  ids: string[],
  lock = false,
): Promise<ContentRecord[]> {
  const schema = registered.definition;
  const fields = Object.keys(schema.fields).filter(
    (key) => schema.fields[key]?.readable,
  );
  const values: unknown[] = [];
  const scope = rowScope(schema, tenantId, values);
  values.push(ids);
  const result = await client.query(
    `SELECT ${rowProjection(schema, fields)} FROM ${tableName(schema)} r
    WHERE ${scope} AND r.${q(schema.key)}::text = ANY($${values.length}::text[])
    ORDER BY r.${q(schema.key)}::text COLLATE "C" ${lock ? "FOR UPDATE" : ""}`,
    values,
  );
  return result.rows;
}
export class PostgresContentReader implements ContentReader {
  async snapshots(
    url: string,
    schema: RegisteredSchema,
    tenantId: string,
    ids: string[],
  ) {
    const pool = sourcePool(url);
    const client = await pool.connect().catch(async (error) => {
      await pool.end();
      throw error;
    });
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await assertSchema(client, schema);
      const rows = await readSnapshots(client, schema, tenantId, ids);
      await client.query("COMMIT");
      return rows;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
  async query(
    url: string,
    registered: RegisteredSchema,
    tenantId: string,
    input: ContentQuery,
  ): Promise<ContentPage> {
    const schema = registered.definition;
    const fields =
      input.fields ??
      Object.keys(schema.fields).filter((key) => schema.fields[key]?.readable);
    for (const field of [...fields, ...input.filters.map((f) => f.field)]) {
      if (
        !Object.hasOwn(schema.fields, field) ||
        !schema.fields[field]?.readable
      )
        throw new PatchError(
          400,
          "UNREADABLE_FIELD",
          "Only declared readable fields may be selected or filtered.",
        );
    }
    if (fields.length === 0 || new Set(fields).size !== fields.length)
      throw new PatchError(
        400,
        "INVALID_FIELDS",
        "Select unique readable fields.",
      );
    const values: unknown[] = [];
    const conditions = [rowScope(schema, tenantId, values)];
    for (const filter of input.filters) {
      if (filter.op === "missing") {
        if (schema.fields[filter.field]?.type !== "text")
          throw new PatchError(
            400,
            "INVALID_FILTER",
            "Missing filters require a text field.",
          );
        values.push(textWhitespace);
        conditions.push(
          `(r.${q(filter.field)} IS NULL OR btrim(r.${q(filter.field)}, $${values.length}) = '')`,
        );
      } else {
        values.push(filter.value);
        conditions.push(
          `r.${q(filter.field)}::text IS NOT DISTINCT FROM $${values.length}`,
        );
      }
    }
    if (input.after !== undefined) {
      values.push(input.after);
      conditions.push(
        `r.${q(schema.key)}::text COLLATE "C" > $${values.length} COLLATE "C"`,
      );
    }
    values.push(input.limit + 1);
    const pool = sourcePool(url);
    const client = await pool.connect().catch(async (error) => {
      await pool.end();
      throw error;
    });
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await assertSchema(client, registered);
      const result = await client.query(
        `SELECT ${rowProjection(schema, fields)} FROM ${tableName(schema)} r
        WHERE ${conditions.join(" AND ")} ORDER BY r.${q(schema.key)}::text COLLATE "C" LIMIT $${values.length}`,
        values,
      );
      await client.query("COMMIT");
      const records = result.rows.slice(0, input.limit);
      return {
        records,
        nextCursor:
          result.rows.length > input.limit
            ? (records.at(-1)?.id ?? null)
            : null,
        schemaVersion: fingerprint(registered),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
}
