import type { Prisma, PrismaClient, ContentPatch } from "@prisma/client";
import type { Patch, PatchPayload, PatchRepository, PatchState } from "./patch";
export class PrismaPatchRepository implements PatchRepository {
  constructor(private readonly db: PrismaClient) {}
  private map(row: ContentPatch): Patch {
    return { id: row.id, tenantId: row.tenantId, revision: row.revision, state: row.state as PatchState,
      payload: row.payloadJson as unknown as PatchPayload, reviewerId: row.reviewerId, reviewedAt: row.reviewedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason, appliedAt: row.appliedAt?.toISOString() ?? null, failureCode: row.failureCode };
  }
  async create(patch: Patch) {
    await this.db.contentPatch.create({ data: { id: patch.id, tenantId: patch.tenantId, sourceId: patch.payload.sourceId, revision: patch.revision,
      state: patch.state, creatorId: patch.payload.creator.id, payloadJson: patch.payload as unknown as Prisma.InputJsonValue } });
  }
  async find(tenantId: string, id: string) {
    const row = await this.db.contentPatch.findFirst({ where: { id, tenantId } });
    return row ? this.map(row) : null;
  }
  async list(tenantId: string, connectionIds: string[] | null, after: string | undefined, limit: number) {
    const rows = await this.db.contentPatch.findMany({ where: { tenantId, ...(connectionIds !== null ? { sourceId: { in: connectionIds } } : {}),
      ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: limit });
    return rows.map(row => this.map(row));
  }
}
