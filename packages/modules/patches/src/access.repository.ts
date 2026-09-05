import type { PrismaClient } from "@prisma/client";
import {
  permissions,
  type AccessRepository,
  type Actor,
  type Identity,
  type Permission,
} from "./access";

export class PrismaAccessRepository implements AccessRepository {
  constructor(private readonly db: PrismaClient) {}

  async human(identity: Identity): Promise<Actor | null> {
    const membership = await this.db.membership.findFirst({
      where: {
        userId: identity.userId,
        tenantId: identity.tenantId,
        user: { status: "ACTIVE" },
        tenant: { status: "ACTIVE" },
      },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
            rolePermissionGrants: true,
          },
        },
      },
    });
    if (
      !membership ||
      (membership.role.tenantId !== null &&
        membership.role.tenantId !== identity.tenantId)
    )
      return null;
    const granted = new Set<Permission>(["read", "propose"]);
    if (["OWNER", "ADMIN"].includes(membership.role.systemKey ?? ""))
      permissions.forEach((p) => granted.add(p));
    for (const p of permissions) {
      if (
        membership.role.rolePermissions.some(
          (r) => r.permission.key === `patchctl:${p}`,
        )
      )
        granted.add(p);
      const overrides = membership.role.rolePermissionGrants.filter(
        (g) =>
          (g.tenantId === identity.tenantId || g.tenantId === null) &&
          g.permissionKey === `patchctl:${p}`,
      );
      if (overrides.some((g) => g.effect === "ALLOW")) granted.add(p);
      if (overrides.some((g) => g.effect === "DENY")) granted.delete(p);
    }
    return {
      tenantId: identity.tenantId,
      id: identity.userId,
      ownerUserId: identity.userId,
      kind: "human",
      permissions: [...granted],
      connectionIds: null,
    };
  }

  async agent(keyHash: string): Promise<Actor | null> {
    const key = await this.db.apiKey.findFirst({
      where: {
        keyHash,
        revokedAt: null,
        tenant: { status: "ACTIVE" },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!key?.ownerUserId) return null;
    const owner = await this.human({
      userId: key.ownerUserId,
      tenantId: key.tenantId,
    });
    if (!owner) return null;
    return {
      tenantId: key.tenantId,
      id: key.id,
      ownerUserId: key.ownerUserId,
      kind: "agent",
      permissions: owner.permissions.filter(
        (p) => (p === "read" || p === "propose") && key.scopes.includes(p),
      ),
      connectionIds: key.connectionIds,
    };
  }
}
