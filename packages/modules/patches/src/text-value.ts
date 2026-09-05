import { PatchError } from "./patch.errors";
export function validateTextValue(value: unknown, field: { nullable: boolean; maxLength: number }, name: string) {
  if (value === null && field.nullable) return;
  if (typeof value !== "string" || [...value].length > field.maxLength || value.includes("\0") ||
    [...value].some(character => { const code = character.codePointAt(0)!; return code >= 0xd800 && code <= 0xdfff; })) {
    throw new PatchError(400, "INVALID_VALUE", `Invalid text value for ${name}.`);
  }
}
