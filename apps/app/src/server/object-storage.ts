import type { ObjectStoragePort } from "@corely/kernel";
import { createObjectStorageFromEnv } from "@corely/storage";

declare global {
  var __corelyObjectStorage: ObjectStoragePort | undefined;
}

export function getObjectStorage(): ObjectStoragePort {
  if (!globalThis.__corelyObjectStorage) {
    globalThis.__corelyObjectStorage = createObjectStorageFromEnv(process.env as Record<
      string,
      string | undefined
    >);
  }

  return globalThis.__corelyObjectStorage;
}

export function getUploadTtlSeconds() {
  const raw = Number(process.env.SIGNED_URL_UPLOAD_TTL_SECONDS ?? "600");
  return Number.isFinite(raw) && raw > 0 ? raw : 600;
}

export function getStorageKeyPrefix() {
  return process.env.STORAGE_KEY_PREFIX?.trim() || "";
}
