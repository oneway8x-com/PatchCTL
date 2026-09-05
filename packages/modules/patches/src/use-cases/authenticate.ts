import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AccessRepository, Actor, Identity } from "../access";
import { PatchError } from "../patch.errors";

export function verifyIdentity(token: string, secret: string, now = Date.now()): Identity | null {
  try {
    if (secret.length < 32 || token.length > 8192) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts as [string, string, string];
    const h = JSON.parse(Buffer.from(header, "base64url").toString());
    if (h.alg !== "HS256" || h.typ !== "JWT") return null;
    const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof p.exp !== "number" || !Number.isFinite(p.exp) || p.exp <= now / 1000 ||
      (p.nbf !== undefined && (typeof p.nbf !== "number" || !Number.isFinite(p.nbf) || p.nbf > now / 1000)) ||
      typeof p.sub !== "string" || !p.sub || typeof p.tenantId !== "string" || !p.tenantId ||
      (p.kind !== undefined && p.kind !== "human")) return null;
    return { userId: p.sub, tenantId: p.tenantId };
  } catch { return null; }
}

export async function authenticate(request: Request, repository: AccessRepository, jwtSecret: string): Promise<Actor> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (\S+)$/.exec(authorization);
  const token = match?.[1];
  if (!token) throw new PatchError(401, "UNAUTHENTICATED", "A valid bearer credential is required.");
  let actor: Actor | null = null;
  if (/^pct_[A-Za-z0-9_-]{32,128}$/.test(token)) {
    actor = await repository.agent(createHash("sha256").update(token).digest("hex"));
  } else {
    const identity = verifyIdentity(token, jwtSecret);
    if (identity) actor = await repository.human(identity);
  }
  if (!actor) throw new PatchError(401, "UNAUTHENTICATED", "Credential or active Tenant membership is invalid.");
  const requestedTenant = request.headers.get("x-tenant-id");
  if (requestedTenant && requestedTenant !== actor.tenantId) {
    throw new PatchError(403, "TENANT_MISMATCH", "Requested Tenant does not match the credential.");
  }
  return actor;
}
