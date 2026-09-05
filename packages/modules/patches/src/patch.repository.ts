import type { Prisma, PrismaClient, ContentPatch } from "@prisma/client";
import type { Patch, PatchPayload, PatchState } from "./patch";
import type { PatchApplyRepository, ApplyReceipt } from "./apply";
import type { Source } from "./source";
import { canonical } from "./content-schema";
import type { Actor } from "./access";
import type { PatchAuditRepository } from "./audit";
export class PrismaPatchRepository implements PatchApplyRepository, PatchAuditRepository {
  constructor(private readonly db: PrismaClient) {}
  private map(row: ContentPatch): Patch {
    return { id: row.id, tenantId: row.tenantId, revision: row.revision, state: row.state as PatchState,
      payload: row.payloadJson as unknown as PatchPayload, reviewerId: row.reviewerId, reviewedAt: row.reviewedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason, appliedAt: row.appliedAt?.toISOString() ?? null, failureCode: row.failureCode };
  }
  async create(patch: Patch) {
    await this.db.$transaction(async tx => {
      await tx.contentPatch.create({ data: { id: patch.id, tenantId: patch.tenantId, sourceId: patch.payload.sourceId, revision: patch.revision,
        state: patch.state, creatorId: patch.payload.creator.id, payloadJson: patch.payload as unknown as Prisma.InputJsonValue } });
      await tx.auditLog.create({ data: { tenantId: patch.tenantId, entity: "ContentPatch", entityId: patch.id, action: "prepared",
        actorUserId: patch.payload.creator.kind === "human" ? patch.payload.creator.id : null,
        details: JSON.stringify({ actor: patch.payload.creator, revision: patch.revision, records: patch.payload.records, reason: patch.payload.reason }) } });
    });
  }
  async find(tenantId: string, id: string) {
    const row = await this.db.contentPatch.findFirst({ where: { id, tenantId } });
    return row ? this.map(row) : null;
  }
  async decide(tenantId: string, id: string, revision: string, reviewerId: string, decision: "approved" | "rejected", reason: string | null) {
    return this.db.$transaction(async tx => {
      const result = await tx.contentPatch.updateMany({ where: { id, tenantId, revision, state: "pending" },
        data: { state: decision, reviewerId, reviewedAt: new Date(), rejectionReason: decision === "rejected" ? reason : null } });
      if (result.count === 1) await tx.auditLog.create({ data: { tenantId, entity: "ContentPatch", entityId: id, action: decision,
        actorUserId: reviewerId, details: JSON.stringify({ actor: { id: reviewerId, kind: "human" }, revision, reason: decision === "rejected" ? reason : null }) } });
      return result.count === 1;
    });
  }
  async claimApply(patch: Patch, source: Source, actor: Actor) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "IntegrationConnection" WHERE id=${source.id} AND "tenantId"=${patch.tenantId} FOR UPDATE`;
      const current = await tx.integrationConnection.findFirst({ where: { id: source.id, tenantId: patch.tenantId, providerKey: "patchctl.postgres", status: "active" } });
      if (!current || canonical(current.configJson) !== canonical({ secretRef: source.secretRef, schema: source.schema })) return false;
      const result = await tx.contentPatch.updateMany({ where: { id: patch.id, tenantId: patch.tenantId, revision: patch.revision, state: { in: ["approved", "applying"] }, reviewerId: { not: null } }, data: { state: "applying", failureCode: null } });
      if (result.count === 1) await tx.auditLog.create({ data: { tenantId: patch.tenantId, entity: "ContentPatch", entityId: patch.id, action: "apply-attempt", actorUserId: actor.id,
        details: JSON.stringify({ actor: { id: actor.id, kind: actor.kind }, revision: patch.revision }) } });
      return result.count === 1;
    });
  }
  async finishApply(patch: Patch, receipt: ApplyReceipt) {
    await this.db.$transaction(async tx => {
      const result = await tx.contentPatch.updateMany({ where: { id: patch.id, tenantId: patch.tenantId, revision: patch.revision, state: "applying" }, data: { state: "applied", appliedAt: new Date(receipt.appliedAt), failureCode: null } });
      if (result.count === 1) await tx.auditLog.create({ data: { tenantId: patch.tenantId, entity: "ContentPatch", entityId: patch.id, action: "applied", actorUserId: receipt.appliedBy,
        createdAt: new Date(receipt.appliedAt), details: JSON.stringify({ ...receipt, actor: { id: receipt.appliedBy, kind: "human" } }) } });
    });
  }
  async failApply(patch: Patch, code: string, conflict: boolean, actor: Actor) {
    await this.db.$transaction(async tx => {
      const result = await tx.contentPatch.updateMany({ where: { id: patch.id, tenantId: patch.tenantId, revision: patch.revision, state: "applying" },
        data: { state: conflict ? "conflict" : "failed", failureCode: code } });
      if (result.count === 1) await tx.auditLog.create({ data: { tenantId: patch.tenantId, entity: "ContentPatch", entityId: patch.id, action: conflict ? "conflict" : "failed", actorUserId: actor.id,
        details: JSON.stringify({ actor: { id: actor.id, kind: actor.kind }, revision: patch.revision, code }) } });
    });
  }
  async list(tenantId: string, connectionIds: string[] | null, after: string | undefined, limit: number) {
    const rows = await this.db.contentPatch.findMany({ where: { tenantId, ...(connectionIds !== null ? { sourceId: { in: connectionIds } } : {}),
      ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: limit });
    return rows.map(row => this.map(row));
  }
  async history(tenantId: string, patchId: string, after: string | undefined, limit: number) {
    const base = { tenantId, entity: "ContentPatch", entityId: patchId };
    const cursor = after ? await this.db.auditLog.findFirst({ where: { ...base, id: after } }) : null;
    if (after && !cursor) return [];
    const rows = await this.db.auditLog.findMany({ where: { ...base, ...(cursor ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit });
    return rows.map(row => { const details = JSON.parse(row.details ?? "{}"); return { id: row.id, action: row.action, at: row.createdAt.toISOString(), actor: details.actor, details }; });
  }
}
