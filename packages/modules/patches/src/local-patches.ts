import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  LocalProposalSchema,
  LocalDecisionSchema,
  LocalResultSchema,
  canonicalLocal,
  type LocalPatch,
  type LocalProposal,
} from "@corely/contracts";
import { authorize, type Actor } from "./access";
import { PatchError } from "./patch.errors";
import {
  getEffectiveLocalSourceSchema,
  type LocalSourceRepository,
} from "./local-source";

export interface LocalPatchRepository {
  find(tenantId: string, id: string): Promise<LocalPatch | null>;
  list(
    tenantId: string,
    connections: string[] | null,
    after?: string,
    approved?: boolean,
  ): Promise<LocalPatch[]>;
  insert(patch: LocalPatch): Promise<void>;
  replace(before: LocalPatch, after: LocalPatch): Promise<boolean>;
  startExecution(before: LocalPatch, after: LocalPatch): Promise<boolean>;
}
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalLocal(value)).digest("hex");
const event = (name: string, actor: Actor) => ({
  event: name,
  actor: { id: actor.id, kind: actor.kind },
  timestamp: new Date().toISOString(),
});
export async function getLocalPatch(
  actor: Actor,
  repo: LocalPatchRepository,
  id: string,
): Promise<LocalPatch> {
  authorize(actor, "read");
  const patch = await repo.find(actor.tenantId, id);
  if (!patch)
    throw new PatchError(404, "PATCH_NOT_FOUND", "Patch is unavailable.");
  authorize(actor, "read", patch.tenantId, patch.proposal.connectionId);
  return patch;
}
export async function listLocalPatches(
  actor: Actor,
  repo: LocalPatchRepository,
  after?: string,
  approved = false,
) {
  authorize(actor, "read");
  const rows = await repo.list(
    actor.tenantId,
    actor.connectionIds,
    after,
    approved,
  );
  return {
    items: rows.slice(0, 20),
    nextCursor: rows.length > 20 ? rows[19].id : null,
  };
}
function validateProposalAgainstSource(
  proposal: LocalProposal,
  effective: Awaited<ReturnType<typeof getEffectiveLocalSourceSchema>>,
): void {
  if (proposal.schemaVersion !== effective.schemaVersion)
    throw new PatchError(
      409,
      "STALE_SOURCE_SCHEMA",
      "The synchronized source schema changed; prepare a new proposal.",
    );
  if (proposal.configurationVersion !== effective.configurationVersion)
    throw new PatchError(
      409,
      "STALE_SOURCE_CONFIGURATION",
      "The source configuration changed; prepare a new proposal.",
    );
  for (const operation of proposal.operations) {
    const proposedResource = proposal.resources.find(
      (resource) => resource.name === operation.resource,
    );
    if (digest(proposedResource) !== operation.schemaHash)
      throw new PatchError(
        400,
        "INVALID_SCHEMA",
        "Resource metadata does not match the proposal.",
      );
    const currentResource = effective.resources.find(
      (resource) => resource.name === operation.resource,
    );
    if (!currentResource)
      throw new PatchError(
        409,
        "RESOURCE_NOT_MANAGED",
        "The proposal targets a resource that is not currently managed.",
      );
    if (
      !proposedResource ||
      proposedResource.schemaName !== currentResource.schemaName ||
      proposedResource.tableName !== currentResource.tableName ||
      proposedResource.primaryKey !== currentResource.primaryKey
    )
      throw new PatchError(
        409,
        "STALE_SOURCE_SCHEMA",
        "The proposal resource no longer matches the synchronized schema.",
      );
    for (const fieldName of Object.keys(operation.after)) {
      const currentField = currentResource.fields.find(
        (field) => field.name === fieldName,
      );
      if (!currentField)
        throw new PatchError(
          409,
          "STALE_SOURCE_SCHEMA",
          "A proposal field no longer exists in the synchronized schema.",
        );
      const proposedField = proposedResource.fields.find(
        (field) => field.name === fieldName,
      );
      if (
        !proposedField ||
        proposedField.type !== currentField.type ||
        proposedField.nullable !== currentField.nullable ||
        JSON.stringify(proposedField.enumValues) !==
          JSON.stringify(currentField.enumValues) ||
        JSON.stringify(proposedField.relation) !==
          JSON.stringify(currentField.relation)
      )
        throw new PatchError(
          409,
          "STALE_SOURCE_SCHEMA",
          "Proposal field metadata does not match the effective source schema.",
        );
      if (
        operation.before[fieldName] !== operation.after[fieldName] &&
        !currentField.writable
      )
        throw new PatchError(
          409,
          "FIELD_READONLY",
          "A changed field is not currently writable.",
        );
    }
  }
}

export async function submitLocalPatch(
  input: unknown,
  actor: Actor,
  repo: LocalPatchRepository,
  sourceRepository: LocalSourceRepository,
) {
  const proposal = LocalProposalSchema.parse(input);
  authorize(actor, "propose", actor.tenantId, proposal.connectionId);
  const effective = await getEffectiveLocalSourceSchema(
    actor,
    sourceRepository,
    proposal.connectionId,
  );
  validateProposalAgainstSource(proposal, effective);
  const revision = digest(proposal);
  const patch: LocalPatch = {
    id: proposal.id,
    tenantId: actor.tenantId,
    revision,
    status: "SUBMITTED",
    proposal,
    creator: { id: actor.id, kind: actor.kind },
    reviewerId: null,
    reviewedAt: null,
    appliedAt: null,
    failureCode: null,
    events: [event("PATCH_SUBMITTED", actor)],
  };
  await repo.insert(patch);
  const stored = await getLocalPatch(actor, repo, proposal.id);
  if (stored.revision !== revision || stored.creator.id !== actor.id)
    throw new PatchError(
      409,
      "PATCH_ALREADY_SUBMITTED",
      "This patch ID already belongs to an immutable proposal.",
    );
  return stored;
}
export async function decideLocalPatch(
  input: unknown,
  actor: Actor,
  repo: LocalPatchRepository,
  id: string,
) {
  authorize(actor, "review"); // Agent credentials never gain review permission.
  const decision = LocalDecisionSchema.parse(input);
  const patch = await getLocalPatch(actor, repo, id);
  if (patch.status !== "SUBMITTED" || patch.revision !== decision.revision)
    throw new PatchError(
      409,
      "STALE_REVISION",
      "Review the current immutable revision before deciding.",
    );
  const next: LocalPatch = {
    ...patch,
    status: decision.decision,
    reviewerId: actor.id,
    reviewedAt: new Date().toISOString(),
    events: [
      ...patch.events,
      event(
        decision.decision === "APPROVED" ? "PATCH_APPROVED" : "PATCH_REJECTED",
        actor,
      ),
    ],
  };
  if (!(await repo.replace(patch, next)))
    throw new PatchError(
      409,
      "STALE_REVISION",
      "Another reviewer already decided this patch.",
    );
  return next;
}
export async function reportLocalExecution(
  input: unknown,
  actor: Actor,
  repo: LocalPatchRepository,
  id: string,
) {
  const result = LocalResultSchema.parse(input);
  const patch = await getLocalPatch(actor, repo, id);
  authorize(actor, "propose", patch.tenantId, patch.proposal.connectionId);
  if (
    patch.revision !== result.revision ||
    !patch.reviewerId ||
    !patch.reviewedAt
  )
    throw new PatchError(
      409,
      "PATCH_NOT_APPROVED",
      "An exact human-approved revision is required.",
    );
  if (
    patch.status === result.status &&
    patch.failureCode === (result.code ?? null)
  )
    return patch;
  if (patch.status !== "APPROVED")
    throw new PatchError(
      409,
      "PATCH_NOT_APPROVED",
      "Patch is not awaiting local execution.",
    );
  if (
    result.status === "STARTED" &&
    patch.events.some((e) => e.event === "PATCH_APPLY_STARTED")
  )
    return patch;
  if (
    result.status !== "STARTED" &&
    !patch.events.some((e) => e.event === "PATCH_APPLY_STARTED")
  )
    throw new PatchError(
      409,
      "EXECUTION_NOT_STARTED",
      "Report the execution attempt first.",
    );
  const next: LocalPatch = {
    ...patch,
    status: result.status === "STARTED" ? "APPROVED" : result.status,
    appliedAt: result.status === "APPLIED" ? new Date().toISOString() : null,
    failureCode: result.code ?? null,
    events: [
      ...patch.events,
      event(
        result.status === "STARTED"
          ? "PATCH_APPLY_STARTED"
          : `PATCH_${result.status}`,
        actor,
      ),
    ],
  };
  const replaced =
    result.status === "STARTED"
      ? await repo.startExecution(patch, next)
      : await repo.replace(patch, next);
  if (!replaced)
    throw new PatchError(
      409,
      "EXECUTION_RACE",
      "Execution state changed; retry the same result.",
    );
  return next;
}
export async function createLocalClientToken(
  actor: Actor,
  repo: LocalSourceRepository,
) {
  authorize(actor, "configure");
  const token = `pct_${randomBytes(32).toString("base64url")}`,
    connectionId = randomUUID();
  await repo.provisionLocalSourceToken({
    tenantId: actor.tenantId,
    ownerUserId: actor.id,
    keyHash: createHash("sha256").update(token).digest("hex"),
    sourceId: connectionId,
  });
  return { token, connectionId, tenantId: actor.tenantId };
}
