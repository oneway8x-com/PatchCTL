import { PatchDecisionInputSchema as decisionInput } from "@corely/contracts";
import { authorize, type Actor } from "../access";
import type { PatchDecisionRepository } from "../patch";
import type { SourceRepository } from "../source";
import { fingerprint } from "../content-schema";
import { PatchError } from "../patch.errors";
import { getPatch } from "./get-patch";
export { decisionInput };
export async function decidePatch(
  input: unknown,
  actor: Actor,
  id: string,
  patches: PatchDecisionRepository,
  sources: SourceRepository,
) {
  authorize(actor, "review");
  const parsed = decisionInput.parse(input);
  const patch = await getPatch(actor, id, patches, sources);
  if (
    patch.state !== "pending" ||
    parsed.revision !== patch.revision ||
    fingerprint({ tenantId: patch.tenantId, payload: patch.payload }) !==
      patch.revision
  )
    throw new PatchError(
      409,
      "STALE_REVIEW",
      "The patch changed or already has a decision. Refresh before reviewing.",
    );
  if (
    !(await patches.decide(
      actor.tenantId,
      id,
      parsed.revision,
      actor.id,
      parsed.decision,
      parsed.reason ?? null,
    ))
  )
    throw new PatchError(
      409,
      "STALE_REVIEW",
      "Another reviewer already decided this patch. Refresh its state.",
    );
  return getPatch(actor, id, patches, sources);
}
