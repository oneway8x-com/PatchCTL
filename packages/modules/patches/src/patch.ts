import { z } from "zod";
import type { Actor } from "./access";
export const proposalInput = z.object({ sourceId: z.string().uuid(), schemaVersion: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1).max(1000), agentRunLabel: z.string().max(120).optional(),
  records: z.array(z.object({ id: z.string().min(1).max(500), version: z.string().regex(/^[a-f0-9]{32}$/),
    changes: z.record(z.union([z.string().max(100000), z.number().finite(), z.null()])).refine(x => Object.keys(x).length > 0 && Object.keys(x).length <= 50),
  }).strict()).min(1).max(100),
}).strict();
export type ChangeValue = string | number | null;
export type PatchRecord = { id: string; version: string; before: Record<string, ChangeValue>; after: Record<string, ChangeValue> };
export type PatchPayload = { sourceId: string; schemaVersion: string; sourceFingerprint: string; reason: string; agentRunLabel?: string;
  records: PatchRecord[]; creator: Pick<Actor, "id" | "kind" | "ownerUserId">; createdAt: string };
export type PatchState = "pending" | "approved" | "rejected" | "applying" | "applied" | "conflict" | "failed";
export type Patch = { id: string; tenantId: string; revision: string; state: PatchState; payload: PatchPayload;
  reviewerId: string | null; reviewedAt: string | null; rejectionReason: string | null; appliedAt: string | null; failureCode: string | null };
export interface PatchRepository {
  create(patch: Patch): Promise<void>;
  find(tenantId: string, id: string): Promise<Patch | null>;
  list(tenantId: string, connectionIds: string[] | null, after: string | undefined, limit: number): Promise<Patch[]>;
}
export interface PatchDecisionRepository extends PatchRepository {
  decide(tenantId: string, id: string, revision: string, reviewerId: string, decision: "approved" | "rejected", reason: string | null): Promise<boolean>;
}
