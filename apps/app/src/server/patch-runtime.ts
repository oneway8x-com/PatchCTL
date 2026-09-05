import { authenticate, PrismaAccessRepository } from "@corely/modules-patches";
import { getPrisma } from "./prisma";
import {
  PrismaSourceRepository,
  EnvironmentSourceSecrets,
  PostgresProbe,
} from "@corely/modules-patches";
import {
  PrismaPatchRepository,
  PostgresContentReader,
} from "@corely/modules-patches";

export function patchRuntime() {
  return {
    ...sourceRuntime(),
    patches: new PrismaPatchRepository(getPrisma()),
    reader: new PostgresContentReader(),
  };
}

export function sourceRuntime() {
  return {
    repository: new PrismaSourceRepository(getPrisma()),
    secrets: new EnvironmentSourceSecrets(
      process.env.PATCHCTL_SOURCE_SECRETS ?? "{}",
    ),
    probe: new PostgresProbe(),
  };
}

export function getPatchActor(request: Request) {
  return authenticate(
    request,
    new PrismaAccessRepository(getPrisma()),
    process.env.JWT_SECRET ?? "",
  );
}
