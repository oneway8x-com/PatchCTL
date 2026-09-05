import { readContent, PostgresContentReader } from "@corely/modules-patches";
import { getPatchActor, sourceRuntime } from "@/server/patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getPatchActor(request);
    const { repository, secrets } = sourceRuntime();
    return Response.json(await readContent(await request.json(), actor, (await context.params).id, repository, secrets, new PostgresContentReader()));
  } catch (error) { return patchProblem(error); }
}
