import { decideLocalPatch, readPatchJson } from "@corely/modules-patches";
import { getPatchActor } from "@/server/patch-runtime";
import { localPatchRepository } from "@/server/local-patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await decideLocalPatch(await readPatchJson(request), await getPatchActor(request), localPatchRepository(), (await context.params).id)); }
  catch (error) { return patchProblem(error); }
}
