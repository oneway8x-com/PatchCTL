import { request } from "@corely/api-client";
import { LocalStorageAdapter } from "@corely/auth-client/adapters/web";
import type { Actor, Patch } from "@corely/modules-patches";
export async function patchRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  return request<T>({
    url: `/api/patchctl${path}`,
    method,
    body,
    accessToken: await new LocalStorageAdapter().getAccessToken(),
    retry: { maxAttempts: 1 },
  });
}
export type PatchSummary = {
  id: string;
  state: string;
  sourceId: string;
  reason: string;
  affectedRecords: number;
  creator: Patch["payload"]["creator"];
  createdAt: string;
};
export type PatchList = { items: PatchSummary[]; nextCursor: string | null };
export const fetchActor = () => patchRequest<Actor>("/me");
export const fetchPatch = (id: string) =>
  patchRequest<Patch>(`/patches/${encodeURIComponent(id)}`);
export const fetchPatches = (after: string | null) =>
  patchRequest<PatchList>(
    `/patches?limit=20${after ? `&after=${encodeURIComponent(after)}` : ""}`,
  );
