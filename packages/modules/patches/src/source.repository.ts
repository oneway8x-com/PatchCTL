import type { PrismaClient, Prisma } from "@prisma/client";
import type { Source, SourceRepository } from "./source";
import { PatchError } from "./patch.errors";

const providerKey = "patchctl.postgres";
export class PrismaSourceRepository implements SourceRepository {
  constructor(private readonly db: PrismaClient) {}
  private map(row: { id: string; tenantId: string; displayName: string | null; configJson: unknown }): Source {
    const config = row.configJson as { secretRef: string; schema?: unknown };
    return { id: row.id, tenantId: row.tenantId, name: row.displayName ?? row.id, ...config };
  }
  async find(tenantId: string, id: string) {
    const row = await this.db.integrationConnection.findFirst({ where: { id, tenantId, providerKey, status: "active" } });
    return row ? this.map(row) : null;
  }
  async list(tenantId: string) {
    return (await this.db.integrationConnection.findMany({ where: { tenantId, providerKey, status: "active" }, orderBy: { id: "asc" } })).map(row => this.map(row));
  }
  async save(source: Source, create: boolean) {
    const configJson = { secretRef: source.secretRef, ...(source.schema ? { schema: source.schema } : {}) } as Prisma.InputJsonValue;
    if (create) {
      await this.db.integrationConnection.create({ data: { id: source.id, tenantId: source.tenantId, providerKey,
        authMethod: "secret-reference", displayName: source.name, configJson } });
    } else {
      await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "IntegrationConnection" WHERE id=${source.id} AND "tenantId"=${source.tenantId} FOR UPDATE`;
        if (await tx.contentPatch.count({ where: { sourceId: source.id, tenantId: source.tenantId, state: "applying" } }))
          throw new PatchError(409, "SOURCE_BUSY", "Finish or recover the applying patch before changing this source.");
        const result = await tx.integrationConnection.updateMany({ where: { id: source.id, tenantId: source.tenantId, providerKey }, data: { displayName: source.name, configJson } });
        if (result.count !== 1) throw new PatchError(404, "SOURCE_NOT_FOUND", "Source not found.");
      });
    }
  }
}
