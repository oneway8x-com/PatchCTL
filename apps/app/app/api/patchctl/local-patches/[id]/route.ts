import { getLocalPatch } from "@corely/modules-patches";
import { getPatchActor } from "@/server/patch-runtime";
import { localPatchRepository } from "@/server/local-patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await getLocalPatch(await getPatchActor(request), localPatchRepository(), (await context.params).id)); }
  catch (error) { return patchProblem(error); }
}
