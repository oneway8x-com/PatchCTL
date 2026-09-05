import { PatchError } from "./patch.errors";

export const permissions = [
  "read",
  "propose",
  "review",
  "apply",
  "configure",
] as const;
export type Permission = (typeof permissions)[number];
export type Actor = {
  tenantId: string;
  id: string;
  kind: "human" | "agent";
  ownerUserId: string;
  permissions: Permission[];
  connectionIds: string[] | null;
};

export function authorize(
  actor: Actor,
  permission: Permission,
  tenantId = actor.tenantId,
  connectionId?: string,
) {
  if (
    actor.tenantId !== tenantId ||
    !actor.permissions.includes(permission) ||
    (actor.kind === "agent" && !["read", "propose"].includes(permission)) ||
    (connectionId !== undefined &&
      actor.connectionIds !== null &&
      !actor.connectionIds.includes(connectionId))
  ) {
    throw new PatchError(
      403,
      "FORBIDDEN",
      "This actor cannot perform this operation.",
    );
  }
}

export type Identity = { userId: string; tenantId: string };
export interface AccessRepository {
  human(identity: Identity): Promise<Actor | null>;
  agent(keyHash: string): Promise<Actor | null>;
}
