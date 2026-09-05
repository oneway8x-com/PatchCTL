import { decidePatch } from "@corely/modules-patches";
import { getPatchActor, patchRuntime } from "@/server/patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getPatchActor(request);
    const { patches, repository } = patchRuntime();
    return Response.json(await decidePatch(await request.json(), actor, (await context.params).id, patches, repository));
  } catch (error) { return patchProblem(error); }
}
