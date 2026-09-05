import pg from "pg";
import { z } from "zod";
import { LocalError } from "./errors.js";
export type Selection = {
  schemaName: string;
  tableName: string;
  columns: string[];
};
export { LocalError } from "./errors.js";

const columnSchema = z.object({
  schema_name: z.string(),
  table_name: z.string(),
  name: z.string(),
  pg_type: z.string(),
  kind: z.string(),
  nullable: z.boolean(),
  generated: z.boolean(),
  primary: z.boolean(),
  enum_values: z.array(z.string()).nullable(),
  relation_schema: z.string().nullable(),
  relation_table: z.string().nullable(),
  relation_column: z.string().nullable(),
});
export type Column = z.infer<typeof columnSchema>;
export type Field = {
  name: string;
  type:
    | "string"
    | "text"
    | "number"
    | "boolean"
    | "date"
    | "datetime"
    | "enum"
    | "relation"
    | "unsupported";
  nullable: boolean;
  readonly: boolean;
  pgType: string;
  enumValues?: string[];
  relation?: { resource: string; column: string };
};
export type Resource = {
  name: string;
  schemaName: string;
  tableName: string;
  primaryKey: string | null;
  fields: Field[];
  constraints: {
    name: string;
    kind: string;
    definition: string;
    columns: string[];
  }[];
};
export function inferField(column: Column): Field {
  let type: Field["type"] = "unsupported";
  if (["varchar", "bpchar", "uuid"].includes(column.pg_type)) type = "string";
  if (column.pg_type === "text") type = "text";
  if (
    ["int2", "int4", "int8", "numeric", "float4", "float8"].includes(
      column.pg_type,
    )
  )
    type = "number";
  if (column.pg_type === "bool") type = "boolean";
  if (column.pg_type === "date") type = "date";
  if (["timestamp", "timestamptz"].includes(column.pg_type)) type = "datetime";
  if (column.kind === "e") type = "enum";
  const relation =
    column.relation_schema && column.relation_table && column.relation_column
      ? {
          resource: `${column.relation_schema}.${column.relation_table}`,
          column: column.relation_column,
        }
      : undefined;
  return {
    name: column.name,
    type: relation && type !== "unsupported" ? "relation" : type,
    nullable: column.nullable,
    readonly: column.primary || column.generated || type === "unsupported",
    pgType: column.pg_type,
    ...(column.enum_values ? { enumValues: column.enum_values } : {}),
    ...(relation ? { relation } : {}),
  };
}
export const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

export async function withDatabase<T>(
  secret: string,
  action: (client: pg.Client) => Promise<T>,
): Promise<T> {
  let client: pg.Client | undefined;
  try {
    const url = new URL(secret);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
    client = new pg.Client({
      connectionString: secret,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    // Idle socket errors must not reach Node's uncaught error logger.
    client.on("error", () => {});
    await client.connect();
    await client.query("SET TIME ZONE 'UTC'");
    await client.query("SET DateStyle TO 'ISO, YMD'");
    return await action(client);
  } catch (error) {
    if (error instanceof LocalError) throw error;
    if (
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code.startsWith("22")
    )
      throw new LocalError(
        "INVALID_VALUE",
        "A value is not valid for the PostgreSQL column type.",
      );
    throw new LocalError(
      "DATABASE_UNAVAILABLE",
      "Could not complete the local PostgreSQL request. Check connectivity and role permissions.",
    );
  } finally {
    await client?.end().catch(() => {});
  }
}

export async function discoverResources(
  client: pg.Client,
): Promise<Resource[]> {
  const result = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS name,
      t.typname AS pg_type, t.typtype AS kind, NOT a.attnotnull AS nullable,
      (a.attgenerated <> '' OR a.attidentity <> '') AS generated,
      EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisprimary AND a.attnum=ANY(i.indkey)) AS primary,
      (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid) AS enum_values,
      fn.nspname AS relation_schema, fc.relname AS relation_table, fa.attname AS relation_column
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    JOIN pg_type t ON t.oid=a.atttypid
    LEFT JOIN pg_constraint fk ON fk.conrelid=c.oid AND fk.contype='f' AND cardinality(fk.conkey)=1 AND a.attnum=fk.conkey[1]
    LEFT JOIN pg_class fc ON fc.oid=fk.confrelid
    LEFT JOIN pg_namespace fn ON fn.oid=fc.relnamespace
    LEFT JOIN pg_attribute fa ON fa.attrelid=fc.oid AND fa.attnum=fk.confkey[1]
    WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
      AND has_table_privilege(c.oid, 'SELECT')
    ORDER BY n.nspname,c.relname,a.attnum`);
  const columns = z.array(columnSchema).parse(result.rows);
  const resources = new Map<string, Resource>();
  for (const column of columns) {
    const name = `${column.schema_name}.${column.table_name}`;
    const resource = resources.get(name) ?? {
      name,
      schemaName: column.schema_name,
      tableName: column.table_name,
      primaryKey: null,
      fields: [],
      constraints: [],
    };
    if (resource.fields.some((field) => field.name === column.name)) continue;
    resource.fields.push(inferField(column));
    resources.set(name, resource);
  }
  for (const resource of resources.values()) {
    const keys = columns.filter(
      (c) =>
        c.schema_name === resource.schemaName &&
        c.table_name === resource.tableName &&
        c.primary,
    );
    const names = [...new Set(keys.map((key) => key.name))];
    resource.primaryKey = names.length === 1 ? names[0] : null;
    if (!resource.primaryKey)
      resource.fields.forEach((field) => {
        field.readonly = true;
      });
    const constraints = await client.query(
      `SELECT co.conname AS name, co.contype::text AS kind,
      pg_get_constraintdef(co.oid) AS definition,
      ARRAY(SELECT a.attname::text FROM unnest(co.conkey) WITH ORDINALITY AS k(num,ord)
        JOIN pg_attribute a ON a.attrelid=co.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns
      FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=$2 ORDER BY co.conname`,
      [resource.schemaName, resource.tableName],
    );
    resource.constraints = z
      .array(
        z.object({
          name: z.string(),
          kind: z.string(),
          definition: z.string(),
          columns: z.array(z.string()),
        }),
      )
      .parse(constraints.rows);
  }
  return [...resources.values()];
}

export function selectedResources(
  discovered: Resource[],
  selections: Selection[],
): Resource[] {
  return selections.map((selection) => {
    const resource = discovered.find(
      (r) =>
        r.schemaName === selection.schemaName &&
        r.tableName === selection.tableName,
    );
    if (
      !resource ||
      selection.columns.some(
        (name) => !resource.fields.some((f) => f.name === name),
      )
    )
      throw new LocalError(
        "SCHEMA_CHANGED",
        "An allowed table or column no longer exists. Run patchctl init to review the selection.",
      );
    return {
      ...resource,
      fields: resource.fields.filter((field) =>
        selection.columns.includes(field.name),
      ),
      constraints: resource.constraints.filter((constraint) =>
        constraint.columns.every((name) => selection.columns.includes(name)),
      ),
    };
  });
}
export function requireResource(resources: Resource[], name: string): Resource {
  const matches = resources.filter(
    (r) => r.name === name || r.tableName === name,
  );
  if (matches.length !== 1)
    throw new LocalError(
      "RESOURCE_NOT_FOUND",
      "Resource is not selected, does not exist, or requires a schema-qualified name.",
    );
  return matches[0];
}
export async function readRecords(
  client: pg.Client,
  resource: Resource,
  id?: string,
  limit = 20,
): Promise<Record<string, unknown>[]> {
  if (
    !resource.primaryKey ||
    !resource.fields.some((f) => f.name === resource.primaryKey)
  )
    throw new LocalError(
      "UNSUPPORTED_PRIMARY_KEY",
      "Select a table with a supported single-column primary key and include that column.",
    );
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new LocalError(
      "INVALID_VALUE",
      "Limit must be an integer from 1 to 1000.",
    );
  // Read-only/unsupported fields remain visible in schema, but their values are
  // deliberately excluded. Cast values with lossy JS decoders to text.
  const fields = resource.fields.filter((f) => f.type !== "unsupported");
  const projection = fields
    .map((f) => {
      const column = quoteIdentifier(f.name);
      return ["int8", "numeric", "date", "timestamp", "timestamptz"].includes(
        f.pgType,
      )
        ? `${column}::text AS ${column}`
        : column;
    })
    .join(", ");
  if (!projection || !fields.some((f) => f.name === resource.primaryKey))
    throw new LocalError(
      "UNSUPPORTED_PRIMARY_KEY",
      "Primary key type is unsupported.",
    );
  const key = quoteIdentifier(resource.primaryKey);
  const result = await client.query(
    `SELECT ${projection} FROM ${quoteIdentifier(resource.schemaName)}.${quoteIdentifier(resource.tableName)} ${id !== undefined ? `WHERE ${key}=$1` : ""} ORDER BY ${key} LIMIT $${id !== undefined ? 2 : 1}`,
    id !== undefined ? [id, 1] : [limit],
  );
  return z.array(z.record(z.string(), z.unknown())).parse(result.rows);
}

export async function privilegeWarnings(client: pg.Client): Promise<string[]> {
  const result =
    await client.query(`SELECT r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR d.datdba=r.oid AS broad
    FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`);
  const rows = z.array(z.object({ broad: z.boolean() })).parse(result.rows);
  const resources = await discoverResources(client);
  return rows.some((r) => r.broad) || resources.length > 10
    ? [
        "This database credential has broad permissions. Use a dedicated PostgreSQL role limited to intended content tables.",
      ]
    : [];
}

export async function readSnapshot(
  client: pg.Client,
  resource: Resource,
  id: string,
) {
  if (!resource.primaryKey)
    throw new LocalError(
      "UNSUPPORTED_PRIMARY_KEY",
      "A single-column primary key is required.",
    );
  const fields = resource.fields.filter((f) => f.type !== "unsupported");
  const projection = fields
    .map((f) => {
      const column = quoteIdentifier(f.name);
      return ["int8", "numeric", "date", "timestamp", "timestamptz"].includes(
        f.pgType,
      )
        ? `original.${column}::text AS ${column}`
        : `original.${column}`;
    })
    .join(", ");
  const result = await client.query(
    `SELECT row_to_json(selected) AS record,
    encode(sha256(convert_to(to_jsonb(original)::text, 'UTF8')), 'hex') AS hash
    FROM ${quoteIdentifier(resource.schemaName)}.${quoteIdentifier(resource.tableName)} original
    CROSS JOIN LATERAL (SELECT ${projection}) selected
    WHERE original.${quoteIdentifier(resource.primaryKey)}=$1`,
    [id],
  );
  const rows = z
    .array(
      z.object({
        record: z.record(z.string(), z.unknown()),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .parse(result.rows);
  if (rows.length !== 1)
    throw new LocalError(
      "RECORD_NOT_FOUND",
      "Record does not exist in the selected resource.",
    );
  return rows[0];
}

export async function validateRelation(
  client: pg.Client,
  resources: Resource[],
  field: Field,
  value: unknown,
): Promise<void> {
  if (!field.relation || value === null) return;
  const target = resources.find((r) => r.name === field.relation?.resource);
  if (!target || !target.fields.some((f) => f.name === field.relation?.column))
    throw new LocalError(
      "RELATION_NOT_FOUND",
      "Select the related resource and column before assigning a relation.",
    );
  const result = await client.query(
    `SELECT 1 FROM ${quoteIdentifier(target.schemaName)}.${quoteIdentifier(target.tableName)} WHERE ${quoteIdentifier(field.relation.column)}=$1 LIMIT 1`,
    [value],
  );
  if (result.rowCount !== 1)
    throw new LocalError("RELATION_NOT_FOUND", "Related record was not found.");
}
