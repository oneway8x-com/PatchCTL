import type { PrismaClient } from "@prisma/client";
import { LocalPatchSchema, type LocalPatch } from "@corely/contracts";
import type { LocalPatchRepository } from "./local-patches";
export class PrismaLocalPatchRepository implements LocalPatchRepository {
  constructor(private readonly db: PrismaClient) {}
  async find(tenantId: string, id: string) {
    const row = await this.db.localContentPatch.findFirst({ where: { tenantId, id } });
    return row ? LocalPatchSchema.parse(JSON.parse(row.document)) : null;
  }
  async list(tenantId: string, connections: string[] | null, after?: string, approved = false) {
    const rows = await this.db.localContentPatch.findMany({ where: {
      tenantId, ...(connections !== null ? { connectionId: { in: connections } } : {}),
      ...(approved ? { status: "APPROVED" } : {}), ...(after ? { id: { gt: after } } : {}),
    }, orderBy: { id: "asc" }, take: 21 });
    return rows.map((row) => LocalPatchSchema.parse(JSON.parse(row.document)));
  }
  async insert(patch: LocalPatch) {
    await this.db.localContentPatch.createMany({ data: [{ id: patch.id, tenantId: patch.tenantId, connectionId: patch.proposal.connectionId, revision: patch.revision, status: patch.status, document: JSON.stringify(patch) }], skipDuplicates: true });
  }
  async replace(before: LocalPatch, after: LocalPatch) {
    const result = await this.db.localContentPatch.updateMany({ where: { id: before.id, tenantId: before.tenantId, revision: before.revision, document: JSON.stringify(before) }, data: { status: after.status, document: JSON.stringify(after) } });
    return result.count === 1;
  }
  async token(tenantId: string, ownerUserId: string, keyHash: string, connectionId: string) {
    await this.db.apiKey.create({ data: { tenantId, ownerUserId, keyHash, name: `Local PatchCTL client ${connectionId}`, scopes: ["read", "propose"], connectionIds: [connectionId] } });
  }
}
