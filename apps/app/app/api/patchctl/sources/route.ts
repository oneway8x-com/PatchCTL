import {
  configureSource,
  listPatchctlSources,
  readPatchJson,
} from "@corely/modules-patches";
import { getPatchActor, sourceRuntime } from "@/server/patch-runtime";
import { localPatchRepository } from "@/server/local-patch-runtime";
import { patchProblem } from "@/server/patch-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await getPatchActor(request);
    const localOnly = new URL(request.url).searchParams.get("local") === "true";
    const hostedRepository =
      !localOnly && process.env.PATCHCTL_LEGACY_SERVER_CONTENT === "1"
        ? sourceRuntime().repository
        : undefined;
    return Response.json(
      await listPatchctlSources(
        actor,
        localPatchRepository(),
        hostedRepository,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return patchProblem(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getPatchActor(request);
    const { repository, secrets, probe } = sourceRuntime();
    return Response.json(
      await configureSource(
        await readPatchJson(request),
        actor,
        repository,
        secrets,
        probe,
      ),
      { status: 201 },
    );
  } catch (error) {
    return patchProblem(error);
  }
}
