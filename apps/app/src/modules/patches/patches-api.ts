"use client";
import { createPatchctlClient } from "@corely/api-client/patchctl";
import { LocalStorageAdapter } from "@corely/auth-client/adapters/web";

// No token is cached in this client. Read the active browser credential for each call.
export const patchClient = createPatchctlClient({
  baseUrl: "",
  getAccessToken: () => new LocalStorageAdapter().getAccessToken(),
});
export const fetchActor = () => patchClient.actor();
export const fetchPatch = (id: string) => patchClient.patch(id);
export const fetchPatches = (after: string | null) =>
  patchClient.patches({ limit: 20, ...(after ? { after } : {}) });
