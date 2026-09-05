import { PatchError } from "./patch.errors";
export async function readPatchJson(
  request: Request,
  maxBytes = 2_000_000,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new PatchError(413, "PATCH_TOO_LARGE", "JSON input exceeds 2 MB.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new PatchError(400, "INVALID_JSON", "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new PatchError(
          413,
          "PATCH_TOO_LARGE",
          "JSON input exceeds 2 MB.",
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new PatchError(
        400,
        "INVALID_JSON",
        "A valid UTF-8 JSON body is required.",
      );
    }
  } finally {
    reader.releaseLock();
  }
}
