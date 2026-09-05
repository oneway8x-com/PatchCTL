import { z } from "zod";
import type { RegisteredSchema } from "./content-schema";
import { ContentQueryInputSchema as queryInput } from "@corely/contracts";
export { queryInput };
export type ContentQuery = z.infer<typeof queryInput>;
export type ContentRecord = {
  id: string;
  version: string;
  values: Record<string, string | number | null>;
};
export type ContentPage = {
  records: ContentRecord[];
  nextCursor: string | null;
  schemaVersion: string;
};
export interface ContentReader {
  query(
    url: string,
    schema: RegisteredSchema,
    tenantId: string,
    query: ContentQuery,
  ): Promise<ContentPage>;
  snapshots(
    url: string,
    schema: RegisteredSchema,
    tenantId: string,
    ids: string[],
  ): Promise<ContentRecord[]>;
}
