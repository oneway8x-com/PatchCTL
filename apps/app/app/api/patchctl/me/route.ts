import { getPatchActor } from "@/server/patch-runtime";
import { patchProblem } from "@/server/patch-response";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return Response.json(await getPatchActor(request));
  } catch (error) {
    return patchProblem(error);
  }
}
