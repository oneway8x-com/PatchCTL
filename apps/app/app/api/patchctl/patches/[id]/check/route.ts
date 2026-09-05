import {
  checkConflicts,
  PostgresConflictChecker,
} from "@corely/modules-patches";
import { getPatchActor, patchRuntime } from "@/server/patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getPatchActor(request);
    const { patches, repository, secrets } = patchRuntime();
    return Response.json(
      await checkConflicts(
        await readPatchJson(request),
        actor,
        (await context.params).id,
        patches,
        repository,
        secrets,
        new PostgresConflictChecker(),
      ),
    );
  } catch (error) {
    return patchProblem(error);
  }
}
import { readPatchJson } from "@corely/modules-patches";
