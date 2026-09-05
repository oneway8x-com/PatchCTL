import type { Prisma, PrismaClient, ContentPatch } from "@prisma/client";
import type { Patch, PatchPayload, PatchState } from "./patch";
import type { PatchApplyRepository, ApplyReceipt } from "./apply";
import type { Source } from "./source";
import { canonical } from "./content-schema";
export class PrismaPatchRepository implements PatchApplyRepository {
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
  async decide(tenantId: string, id: string, revision: string, reviewerId: string, decision: "approved" | "rejected", reason: string | null) {
    const result = await this.db.contentPatch.updateMany({ where: { id, tenantId, revision, state: "pending" },
      data: { state: decision, reviewerId, reviewedAt: new Date(), rejectionReason: decision === "rejected" ? reason : null } });
    return result.count === 1;
  }
  async claimApply(patch: Patch, source: Source) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "IntegrationConnection" WHERE id=${source.id} AND "tenantId"=${patch.tenantId} FOR UPDATE`;
      const current = await tx.integrationConnection.findFirst({ where: { id: source.id, tenantId: patch.tenantId, providerKey: "patchctl.postgres", status: "active" } });
      if (!current || canonical(current.configJson) !== canonical({ secretRef: source.secretRef, schema: source.schema })) return false;
      const result = await tx.contentPatch.updateMany({ where: { id: patch.id, tenantId: patch.tenantId, revision: patch.revision, state: { in: ["approved", "applying"] }, reviewerId: { not: null } }, data: { state: "applying", failureCode: null } });
      return result.count === 1;
    });
  }
  async finishApply(patch: Patch, receipt: ApplyReceipt) {
    await this.db.contentPatch.updateMany({ where: { id: patch.id, tenantId: patch.tenantId, revision: patch.revision, state: "applying" }, data: { state: "applied", appliedAt: new Date(receipt.appliedAt), failureCode: null } });
  }
  async failApply(patch: Patch, code: string, conflict: boolean) {
    await this.db.contentPatch.updateMany({ where: { id: patch.id, tenantId: patch.tenantId, revision: patch.revision, state: "applying" },
      data: { state: conflict ? "conflict" : "failed", failureCode: code } });
  }
  async list(tenantId: string, connectionIds: string[] | null, after: string | undefined, limit: number) {
    const rows = await this.db.contentPatch.findMany({ where: { tenantId, ...(connectionIds !== null ? { sourceId: { in: connectionIds } } : {}),
      ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: limit });
    return rows.map(row => this.map(row));
  }
}
