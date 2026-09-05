import { listLocalPatches, submitLocalPatch, readPatchJson } from "@corely/modules-patches";
import { getPatchActor } from "@/server/patch-runtime";
import { localPatchRepository } from "@/server/local-patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    return Response.json(await listLocalPatches(await getPatchActor(request), localPatchRepository(), query.get("after") ?? undefined, query.get("approved") === "true"));
  } catch (error) { return patchProblem(error); }
}
export async function POST(request: Request) {
  try { return Response.json(await submitLocalPatch(await readPatchJson(request), await getPatchActor(request), localPatchRepository()), { status: 201 }); }
  catch (error) { return patchProblem(error); }
}
