import { authenticate, PrismaAccessRepository } from "@corely/modules-patches";
import { getPrisma } from "./prisma";
import { PrismaSourceRepository, EnvironmentSourceSecrets, PostgresProbe } from "@corely/modules-patches";

export function sourceRuntime() {
  return { repository: new PrismaSourceRepository(getPrisma()),
    secrets: new EnvironmentSourceSecrets(process.env.PATCHCTL_SOURCE_SECRETS ?? "{}"), probe: new PostgresProbe() };
}

export function getPatchActor(request: Request) {
  return authenticate(request, new PrismaAccessRepository(getPrisma()), process.env.JWT_SECRET ?? "");
}
