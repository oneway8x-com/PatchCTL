import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize, type Actor } from "../access";
import { PatchError } from "../patch.errors";
import { publicSource, type SourceRepository, type SourceSecrets, type ConnectionProbe } from "../source";

const configInput = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), secretRef: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) }).strict();
export async function configureSource(input: unknown, actor: Actor, repository: SourceRepository, secrets: SourceSecrets, probe: ConnectionProbe) {
  authorize(actor, "configure");
  const parsed = configInput.parse(input);
  const existing = parsed.id ? await repository.find(actor.tenantId, parsed.id) : null;
  if (parsed.id && !existing) throw new PatchError(404, "SOURCE_NOT_FOUND", "Source not found.");
  await probe.test(secrets.resolve(actor.tenantId, parsed.secretRef));
  const source = { ...existing, ...parsed, id: parsed.id ?? randomUUID(), tenantId: actor.tenantId };
  await repository.save(source, !existing);
  return publicSource(source);
}
export async function listSources(actor: Actor, repository: SourceRepository) {
  authorize(actor, "read");
  const sources = await repository.list(actor.tenantId);
  return sources.filter(s => actor.connectionIds === null || actor.connectionIds.includes(s.id)).map(publicSource);
}
export async function requireSource(actor: Actor, id: string, repository: SourceRepository) {
  authorize(actor, "read", actor.tenantId, id);
  const source = await repository.find(actor.tenantId, id);
  if (!source) throw new PatchError(404, "SOURCE_NOT_FOUND", "Source not found.");
  return source;
}
export async function testSource(actor: Actor, id: string, repository: SourceRepository, secrets: SourceSecrets, probe: ConnectionProbe) {
  authorize(actor, "configure");
  const source = await requireSource(actor, id, repository);
  await probe.test(secrets.resolve(actor.tenantId, source.secretRef));
  return { connected: true };
}
