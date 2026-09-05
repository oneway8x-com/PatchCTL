import { PrismaLocalPatchRepository } from "@corely/modules-patches";
import { getPrisma } from "./prisma";
export const localPatchRepository = () => new PrismaLocalPatchRepository(getPrisma());
