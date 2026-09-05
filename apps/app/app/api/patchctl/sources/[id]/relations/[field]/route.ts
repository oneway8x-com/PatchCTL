import { readRelationTargets, PostgresRelationReader } from "@corely/modules-patches";
import { getPatchActor, sourceRuntime } from "@/server/patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; field: string }> }) {
  try {
    const actor = await getPatchActor(request), { id, field } = await context.params;
    const { repository, secrets } = sourceRuntime();
    return Response.json(await readRelationTargets(Object.fromEntries(new URL(request.url).searchParams), actor, id, field, repository, secrets, new PostgresRelationReader()));
  } catch (error) { return patchProblem(error); }
}
