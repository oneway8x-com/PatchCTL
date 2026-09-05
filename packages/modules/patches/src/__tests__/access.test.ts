import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { authorize, type Actor } from "../access";
import { authenticate, verifyIdentity } from "../use-cases/authenticate";
import { PrismaAccessRepository } from "../access.repository";

const secret = "test-secret-32-characters-minimum-value";
const human: Actor = { id: "user", ownerUserId: "user", kind: "human", tenantId: "tenant", permissions: ["read", "propose", "review", "apply"], connectionIds: null };
function token(extra: Record<string, unknown> = {}, header = { alg: "HS256", typ: "JWT" }) {
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify({ sub: "user", tenantId: "tenant", exp: Date.now() / 1000 + 300, ...extra })).toString("base64url");
  return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
}
function request(credential?: string, tenant?: string) {
  return new Request("http://localhost/api/patchctl/me", { headers: {
    ...(credential ? { authorization: `Bearer ${credential}` } : {}),
    ...(tenant ? { "x-tenant-id": tenant } : {}),
  } });
}

describe("verified PatchCTL access", () => {
  it("resolves a verified human and checks current membership", async () => {
    const repo = { human: vi.fn().mockResolvedValue(human), agent: vi.fn() };
    expect(await authenticate(request(token()), repo, secret)).toEqual(human);
    expect(repo.human).toHaveBeenCalledWith({ userId: "user", tenantId: "tenant" });
  });
  it.each([undefined, "invalid", token({ exp: 0 }), token({ exp: null }), token({ tenantId: null }), token({ nbf: Date.now() / 1000 + 500 }), token({ kind: "agent" }), token({}, { alg: "none", typ: "JWT" })])("rejects invalid credentials without a repository lookup", async credential => {
    const repo = { human: vi.fn(), agent: vi.fn() };
    await expect(authenticate(request(credential, "tenant"), repo, secret)).rejects.toMatchObject({ status: 401 });
    expect(repo.human).not.toHaveBeenCalled();
  });
  it("rejects a forged Tenant header even with a valid credential", async () => {
    await expect(authenticate(request(token(), "other"), { human: async () => human, agent: async () => null }, secret)).rejects.toMatchObject({ status: 403 });
  });
  it("denies removed memberships and modified signatures", async () => {
    await expect(authenticate(request(token()), { human: async () => null, agent: async () => null }, secret)).rejects.toMatchObject({ status: 401 });
    expect(verifyIdentity(token() + "bad", secret)).toBeNull();
    expect(verifyIdentity(token(), "short")).toBeNull();
  });
  it("hashes an agent secret and never treats it as a human session", async () => {
    const actor: Actor = { ...human, kind: "agent", id: "key", permissions: ["read", "propose"], connectionIds: ["source"] };
    const repo = { human: vi.fn(), agent: vi.fn().mockResolvedValue(actor) };
    expect(await authenticate(request("pct_" + "a".repeat(32)), repo, secret)).toEqual(actor);
    expect(repo.agent.mock.calls[0]?.[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(repo.human).not.toHaveBeenCalled();
    expect(() => authorize(actor, "read", "tenant", "source")).not.toThrow();
    expect(() => authorize(actor, "read", "tenant", "other")).toThrow();
  });
  it.each(["review", "apply", "configure"] as const)("denies agent %s even with an accidentally granted permission", permission => {
    expect(() => authorize({ ...human, kind: "agent", permissions: [permission] }, permission)).toThrow();
  });
  it("denies cross-Tenant resources and insufficient human permissions", () => {
    expect(() => authorize(human, "read", "other")).toThrow();
    expect(() => authorize({ ...human, permissions: ["read"] }, "review")).toThrow();
  });
});

describe("identity repository permission policy", () => {
  it("applies explicit DENY even to an administrator", async () => {
    const db = { membership: { findFirst: vi.fn().mockResolvedValue({ role: { tenantId: "tenant", systemKey: "ADMIN", rolePermissions: [], rolePermissionGrants: [{ tenantId: "tenant", permissionKey: "patchctl:apply", effect: "DENY" }] } }) } };
    const repo = new PrismaAccessRepository(db as never);
    const actor = await repo.human({ userId: "user", tenantId: "tenant" });
    expect(actor?.permissions).toContain("review");
    expect(actor?.permissions).not.toContain("apply");
    expect(db.membership.findFirst.mock.calls[0]?.[0].where).toMatchObject({ tenantId: "tenant", user: { status: "ACTIVE" }, tenant: { status: "ACTIVE" } });
  });
  it("requires agent ownership, expiry/revocation filtering and active owner membership", async () => {
    const db = { apiKey: { findFirst: vi.fn().mockResolvedValue({ id: "key", tenantId: "tenant", ownerUserId: "user", scopes: ["read", "apply"], connectionIds: ["source"] }) }, membership: { findFirst: vi.fn().mockResolvedValue(null) } };
    expect(await new PrismaAccessRepository(db as never).agent("hash")).toBeNull();
    expect(db.apiKey.findFirst.mock.calls[0]?.[0].where).toMatchObject({ keyHash: "hash", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] });
  });
});
