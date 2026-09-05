import { patchHistory } from "@corely/modules-patches";
import { getPatchActor, patchRuntime } from "@/server/patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getPatchActor(request);
    const { patches, repository } = patchRuntime();
    return Response.json(await patchHistory(Object.fromEntries(new URL(request.url).searchParams), actor, (await context.params).id, patches, repository));
  } catch (error) { return patchProblem(error); }
}
