import type { Actor } from "./access";
import type { RegisteredSchema } from "./content-schema";
import type { Patch, PatchDecisionRepository, PatchRecord } from "./patch";
import type { Source } from "./source";
export type ApplyReceipt = {
  patchId: string;
  tenantId: string;
  revision: string;
  sourceId: string;
  appliedAt: string;
  affectedRecords: number;
  creator: Patch["payload"]["creator"];
  reviewerId: string;
  appliedBy: string;
  records: PatchRecord[];
};
export interface PatchApplyRepository extends PatchDecisionRepository {
  claimApply(patch: Patch, source: Source, actor: Actor): Promise<boolean>;
  finishApply(patch: Patch, receipt: ApplyReceipt): Promise<void>;
  failApply(
    patch: Patch,
    code: string,
    conflict: boolean,
    actor: Actor,
  ): Promise<void>;
}
export interface ContentWriter {
  apply(
    url: string,
    schema: RegisteredSchema,
    patch: Patch,
    actor: Actor,
  ): Promise<ApplyReceipt>;
}
