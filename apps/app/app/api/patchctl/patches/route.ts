import { listPatches, preparePatch } from "@corely/modules-patches";
import { getPatchActor, patchRuntime } from "@/server/patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return Response.json(await listPatches(Object.fromEntries(new URL(request.url).searchParams), await getPatchActor(request), patchRuntime().patches)); }
  catch (error) { return patchProblem(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await getPatchActor(request);
    const { repository, secrets, reader, patches } = patchRuntime();
    return Response.json(await preparePatch(await readPatchJson(request), actor, repository, secrets, reader, patches), { status: 201 });
  } catch (error) { return patchProblem(error); }
}
import { readPatchJson } from "@corely/modules-patches";
