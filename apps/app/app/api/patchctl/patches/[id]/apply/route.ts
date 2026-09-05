import { applyPatch, PostgresContentWriter } from "@corely/modules-patches";
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
      await applyPatch(
        await readPatchJson(request),
        actor,
        (await context.params).id,
        patches,
        repository,
        secrets,
        new PostgresContentWriter(),
      ),
    );
  } catch (error) {
    return patchProblem(error);
  }
}
import { readPatchJson } from "@corely/modules-patches";
