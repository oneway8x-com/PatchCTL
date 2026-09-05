import { authenticate, PrismaAccessRepository } from "@corely/modules-patches";
import { getPrisma } from "./prisma";

export function getPatchActor(request: Request) {
  return authenticate(request, new PrismaAccessRepository(getPrisma()), process.env.JWT_SECRET ?? "");
}
