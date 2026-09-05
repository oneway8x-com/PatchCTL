import { createHash } from "node:crypto";
import { z } from "zod";
import { PatchError } from "./patch.errors";

import {
  PatchIdentifierSchema as identifier,
  PatchContentSchemaInputSchema as contentSchemaInput,
} from "@corely/contracts";
export { identifier, contentSchemaInput };
export type ContentSchema = z.infer<typeof contentSchemaInput>;
export type RegisteredSchema = {
  definition: ContentSchema;
  databaseFingerprint: string;
};
export interface SchemaInspector {
  inspect(url: string, schema: ContentSchema): Promise<string>;
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`)
    .join(",")}}`;
}
export function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function quoteIdentifier(value: string) {
  return `"${identifier.parse(value)}"`;
}
export function tableName(schema: Pick<ContentSchema, "namespace" | "table">) {
  return `${quoteIdentifier(schema.namespace)}.${quoteIdentifier(schema.table)}`;
}
export function registeredSchema(value: unknown): RegisteredSchema {
  const parsed = z
    .object({
      definition: contentSchemaInput,
      databaseFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict()
    .safeParse(value);
  if (!parsed.success)
    throw new PatchError(
      409,
      "SCHEMA_REQUIRED",
      "Configure a valid content schema first.",
    );
  return parsed.data as RegisteredSchema;
}
