import { testSource } from "@corely/modules-patches";
import { getPatchActor, sourceRuntime } from "@/server/patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getPatchActor(request);
    const { repository, secrets, probe } = sourceRuntime();
    return Response.json(await testSource(actor, (await context.params).id, repository, secrets, probe));
  } catch (error) { return patchProblem(error); }
}
