import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { NextRequest } from "next/server";
import { getObjectStorage, getStorageKeyPrefix, getUploadTtlSeconds } from "@/server/object-storage";
import { getTenantContext } from "@/server/tenant-context";

function normalizePathname(pathname: string) {
  return pathname.replace(/^\/+/, "");
}

function isPathnameAllowed(pathname: string) {
  const normalized = normalizePathname(pathname);

  if (!normalized || normalized.includes("..")) {
    return false;
  }

  const prefix = getStorageKeyPrefix();
  if (!prefix) {
    return true;
  }

  return normalized === prefix || normalized.startsWith(`${prefix}/`);
}

export async function POST(request: NextRequest) {
  const storage = getObjectStorage();

  if (storage.provider() !== "vercel_blob") {
    return Response.json(
      {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "Vercel Blob uploads are not enabled for the active storage provider.",
      },
      { status: 404 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;
  const { tenantId } = getTenantContext(request);

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isPathnameAllowed(pathname)) {
          throw new Error("Upload pathname is outside the configured storage prefix.");
        }

        return {
          addRandomSuffix: false,
          allowOverwrite: true,
          validUntil: Date.now() + getUploadTtlSeconds() * 1000,
          tokenPayload: JSON.stringify({
            tenantId,
            pathname: normalizePathname(pathname),
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log(
          JSON.stringify({
            message: "vercel-blob-upload-completed",
            pathname: blob.pathname,
            url: blob.url,
            downloadUrl: blob.downloadUrl,
            tokenPayload,
          })
        );
      },
    });

    return Response.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected upload error";

    return Response.json(
      {
        type: "about:blank",
        title: "Upload token error",
        status: 400,
        detail: message,
      },
      { status: 400 }
    );
  }
}
