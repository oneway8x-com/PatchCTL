import { z } from "zod";
import type { Actor } from "../access";
import type { RelationReader } from "../assignment";
import type { SourceRepository, SourceSecrets } from "../source";
import { registeredSchema, identifier } from "../content-schema";
import { requireSource } from "./sources";
export async function readRelationTargets(input: unknown, actor: Actor, sourceId: string, field: string, sources: SourceRepository, secrets: SourceSecrets, reader: RelationReader) {
  const query = z.object({ after: z.string().min(1).max(500).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict().parse(input);
  const source = await requireSource(actor, sourceId, sources);
  return reader.targets(secrets.resolve(actor.tenantId, source.secretRef), registeredSchema(source.schema), actor.tenantId, identifier.parse(field), { limit: query.limit, ...(query.after ? { after: query.after } : {}) });
}
