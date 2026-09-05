import { configureSchema, getContentSchema, PostgresSchemaInspector } from "@corely/modules-patches";
import { getPatchActor, sourceRuntime } from "@/server/patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { return Response.json(await getContentSchema(await getPatchActor(request), (await context.params).id, sourceRuntime().repository)); }
  catch (error) { return patchProblem(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    const actor = await getPatchActor(request);
    const { repository, secrets } = sourceRuntime();
    return Response.json(await configureSchema(await readPatchJson(request), actor, (await context.params).id, repository, secrets, new PostgresSchemaInspector()));
  } catch (error) { return patchProblem(error); }
}
import { readPatchJson } from "@corely/modules-patches";
