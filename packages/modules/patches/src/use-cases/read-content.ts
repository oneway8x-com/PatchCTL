import type { Actor } from "../access";
import type { SourceRepository, SourceSecrets } from "../source";
import { queryInput, type ContentReader } from "../content";
import { registeredSchema } from "../content-schema";
import { requireSource } from "./sources";
export async function readContent(input: unknown, actor: Actor, sourceId: string, sources: SourceRepository, secrets: SourceSecrets, reader: ContentReader) {
  const source = await requireSource(actor, sourceId, sources);
  return reader.query(secrets.resolve(actor.tenantId, source.secretRef), registeredSchema(source.schema), actor.tenantId, queryInput.parse(input));
}
