import {
  configureLocalSourceSchema,
  readPatchJson,
} from "@corely/modules-patches";
import { getPatchActor } from "@/server/patch-runtime";
import { localPatchRepository } from "@/server/local-patch-runtime";
import { patchProblem } from "@/server/patch-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    return Response.json(
      await configureLocalSourceSchema(
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
