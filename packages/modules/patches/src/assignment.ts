import type { RegisteredSchema, ContentSchema } from "./content-schema";
import type { ChangeValue } from "./patch";
import { PatchError } from "./patch.errors";
import { validateTextValue } from "./text-value";
export type RelationTarget = { id: string; label: string; version: string };
export interface RelationReader {
  targets(url: string, schema: RegisteredSchema, tenantId: string, field: string, input: { ids?: string[]; after?: string; limit: number }): Promise<{ targets: RelationTarget[]; nextCursor: string | null }>;
}
export function validateFieldValue(value: ChangeValue, field: ContentSchema["fields"][string], name: string) {
  if (field.type === "text") return validateTextValue(value, { nullable: field.nullable, maxLength: field.maxLength }, name);
  if (value === null && field.nullable) return;
  if (typeof value !== "string" || !value || value.length > 500 || value.includes("\0"))
    throw new PatchError(400, "INVALID_ASSIGNMENT", `Field ${name} requires a permitted string value or target ID.`);
  if (field.type === "enum" && !field.values?.includes(value))
    throw new PatchError(400, "INVALID_ENUM", `Field ${name} requires a declared enum value.`);
}
