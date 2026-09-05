import type { PatchRepository } from "./patch";
export type PatchAuditEvent = {
  id: string;
  action: string;
  at: string;
  actor: { id: string; kind: string };
  details: Record<string, unknown>;
};
export interface PatchAuditRepository extends PatchRepository {
  history(
    tenantId: string,
    patchId: string,
    after: string | undefined,
    limit: number,
  ): Promise<PatchAuditEvent[]>;
}
