import {
  getLocalSourceSchema,
  readPatchJson,
  syncLocalSourceSchema,
} from "@corely/modules-patches";
import { getPatchActor } from "@/server/patch-runtime";
import { localPatchRepository } from "@/server/local-patch-runtime";
import { patchProblem } from "@/server/patch-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    return Response.json(
      await getLocalSourceSchema(
        await getPatchActor(request),
        localPatchRepository(),
        (await context.params).id,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return patchProblem(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    return Response.json(
      await syncLocalSourceSchema(
        await readPatchJson(request),
        await getPatchActor(request),
        localPatchRepository(),
        (await context.params).id,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return patchProblem(error);
  }
}
