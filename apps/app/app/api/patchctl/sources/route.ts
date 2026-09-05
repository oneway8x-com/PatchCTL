import { configureSource, listSources } from "@corely/modules-patches";
import { getPatchActor, sourceRuntime } from "@/server/patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return Response.json(await listSources(await getPatchActor(request), sourceRuntime().repository)); }
  catch (error) { return patchProblem(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await getPatchActor(request);
    const { repository, secrets, probe } = sourceRuntime();
    return Response.json(await configureSource(await readPatchJson(request), actor, repository, secrets, probe), { status: 201 });
  } catch (error) { return patchProblem(error); }
}
import { readPatchJson } from "@corely/modules-patches";
