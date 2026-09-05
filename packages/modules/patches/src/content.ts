import { z } from "zod";
import { identifier, type RegisteredSchema } from "./content-schema";
export const queryInput = z.object({
  fields: z.array(identifier).min(1).max(50).optional(),
  filters: z.array(z.discriminatedUnion("op", [
    z.object({ field: identifier, op: z.literal("missing") }).strict(),
    z.object({ field: identifier, op: z.literal("eq"), value: z.string().max(100000).nullable() }).strict(),
  ])).max(10).default([]),
  after: z.string().max(500).optional(), limit: z.number().int().min(1).max(100).default(50),
}).strict();
export type ContentQuery = z.infer<typeof queryInput>;
export type ContentRecord = { id: string; version: string; values: Record<string, string | number | null> };
export type ContentPage = { records: ContentRecord[]; nextCursor: string | null; schemaVersion: string };
export interface ContentReader {
  query(url: string, schema: RegisteredSchema, tenantId: string, query: ContentQuery): Promise<ContentPage>;
}
