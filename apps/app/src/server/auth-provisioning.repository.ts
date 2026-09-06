import type { PrismaClient } from "@prisma/client";
import type {
  AuthProvisioningRepository,
  ProvisionedAccount,
  ProvisionSignedInAccountInput,
} from "./auth-provisioning";

function personalTenantName(name: string | null, email: string): string {
  const label = name?.trim() || email.split("@")[0] || "My";
  return `${label}'s Tenant`;
}

export class PrismaAuthProvisioningRepository implements AuthProvisioningRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveOrProvision(
    input: ProvisionSignedInAccountInput,
  ): Promise<ProvisionedAccount> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.upsert({
        where: { email: input.email },
        create: {
          email: input.email,
          name: input.userName?.trim() || input.email.split("@")[0],
          passwordHash: "",
          status: "ACTIVE",
        },
        update: { email: input.email },
      });

      // The row lock serializes concurrent first-login requests for this user.
      await transaction.$queryRaw`
        SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE
      `;

      const existing = await transaction.membership.findFirst({
        where: { userId: user.id, tenantId: { not: null } },
        include: { tenant: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      if (existing?.tenantId && existing.tenant) {
        return {
          user,
          membership: {
            id: existing.id,
            tenantId: existing.tenantId,
            roleId: existing.roleId,
            tenant: existing.tenant,
          },
        };
      }

      const tenant = await transaction.tenant.create({
        data: {
          name: personalTenantName(user.name, user.email),
          slug: `personal-${user.id.toLowerCase()}`,
          status: "ACTIVE",
        },
      });
      const role = await transaction.role.create({
        data: {
          tenantId: tenant.id,
          name: "Owner",
          scope: "TENANT",
          systemKey: "OWNER",
          description: "Full access for the account that created this Tenant.",
          isSystem: true,
        },
      });
      const membership = await transaction.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          roleId: role.id,
        },
      });

      return {
        user,
        membership: {
          id: membership.id,
          tenantId: tenant.id,
          roleId: role.id,
          tenant,
        },
      };
    });
  }
}
