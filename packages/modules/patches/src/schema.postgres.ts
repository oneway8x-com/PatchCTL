import type { PoolClient } from "pg";
import { sourcePool } from "./postgres";
import { fingerprint, tableName, type ContentSchema, type SchemaInspector } from "./content-schema";
import { PatchError } from "./patch.errors";

export async function inspectSchema(client: PoolClient, schema: ContentSchema): Promise<string> {
  const table = tableName(schema);
  const columns = (await client.query(`SELECT a.attname AS name, t.typname AS type, t.typtype AS kind,
    a.attnotnull AS required, a.attgenerated AS generated, a.attidentity AS identity,
    a.atttypmod AS modifier FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = to_regclass($1) AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [table])).rows;
  const constraints = (await client.query(`SELECT contype, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid = to_regclass($1) ORDER BY conname`, [table])).rows;
  const primary = (await client.query(`SELECT a.attname AS name, i.indnkeyatts AS count
    FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
    WHERE i.indrelid=to_regclass($1) AND i.indisprimary`, [table])).rows;
  if (primary.length !== 1 || primary[0].name !== schema.key || primary[0].count !== 1)
    throw new PatchError(400, "INVALID_SCHEMA", "The table must have the declared single-column primary key.");
  for (const [name, field] of Object.entries(schema.fields)) {
    const column = columns.find(c => c.name === name);
    if (!column || (field.editable && (column.generated || column.identity)) ||
      (field.nullable && column.required) ||
      (field.type === "text" && !["text", "varchar", "bpchar"].includes(column.type)) ||
      (field.type === "enum" && column.kind !== "e" && !["text", "varchar"].includes(column.type)) ||
      (field.type === "relation" && !["text", "varchar", "uuid", "int4", "int8"].includes(column.type))) {
      throw new PatchError(400, "INVALID_SCHEMA", `Field ${name} does not match the database schema.`);
    }
  }
  const isolation = schema.isolation;
  if (isolation.mode === "row" && !columns.some(c => c.name === isolation.tenantColumn && ["text", "varchar", "uuid"].includes(c.type)))
    throw new PatchError(400, "INVALID_SCHEMA", "A valid Tenant column is required.");
  const enumValues = (await client.query(`SELECT a.attname AS field, e.enumlabel AS value FROM pg_attribute a
    JOIN pg_enum e ON e.enumtypid=a.atttypid WHERE a.attrelid=to_regclass($1) ORDER BY a.attname,e.enumsortorder`, [table])).rows;
  const relations: Record<string, string> = {};
  for (const [name, field] of Object.entries(schema.fields)) {
    if (field.type === "enum" && columns.find(c => c.name === name)?.kind === "e" && field.values?.some(value => !enumValues.some(e => e.field === name && e.value === value)))
      throw new PatchError(400, "INVALID_SCHEMA", `Field ${name} declares an unknown database enum value.`);
    if (field.type !== "relation" || !field.relation) continue;
    const target = field.relation;
    const foreignKey = await client.query(`SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=c.confkey[1]
      WHERE c.contype='f' AND c.conrelid=to_regclass($1) AND c.confrelid=to_regclass($2) AND cardinality(c.conkey)=1 AND cardinality(c.confkey)=1
      AND a.attname=$3 AND b.attname=$4 AND c.convalidated`, [table, tableName(target), name, target.key]);
    if (!foreignKey.rowCount) throw new PatchError(400, "INVALID_SCHEMA", `Field ${name} requires a validated single-column foreign key to its target.`);
    relations[name] = await inspectSchema(client, { namespace: target.namespace, table: target.table, key: target.key,
      isolation: { mode: "row", tenantColumn: target.tenantColumn }, fields: { [target.label]: { type: "text", readable: true, editable: false, nullable: false, maxLength: 10000 } } });
  }
  return fingerprint({ columns, constraints, primary, enumValues, relations });
}
export class PostgresSchemaInspector implements SchemaInspector {
  async inspect(url: string, schema: ContentSchema) {
    const pool = sourcePool(url);
    let client: PoolClient | undefined;
    try { client = await pool.connect(); return await inspectSchema(client, schema); }
    finally { client?.release(); await pool.end(); }
  }
}
