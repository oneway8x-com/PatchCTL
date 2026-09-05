import { get, head, put } from "@vercel/blob";
import type {
  HeadObject,
  ObjectStoragePort,
  SignedDownload,
  SignedUpload,
} from "@corely/kernel/ports/object-storage.port";

type VercelBlobObjectStorageAdapterOptions = {
  bucketName: string;
  access: "public" | "private";
  token?: string | undefined;
  handleUploadUrl: string;
};

async function streamToBuffer(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export class VercelBlobObjectStorageAdapter implements ObjectStoragePort {
  private readonly bucketName: string;
  private readonly access: "public" | "private";
  private readonly token: string | undefined;
  private readonly handleUploadUrl: string;

  constructor(options: VercelBlobObjectStorageAdapterOptions) {
    this.bucketName = options.bucketName;
    this.access = options.access;
    this.token = options.token;
    this.handleUploadUrl = options.handleUploadUrl;
  }

  provider(): "vercel_blob" {
    return "vercel_blob";
  }

  bucket(): string {
    return this.bucketName;
  }

  async createSignedUploadUrl(args: {
    tenantId: string;
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<SignedUpload> {
    return {
      mode: "vercel_blob_client_upload",
      pathname: args.objectKey,
      uploadUrl: this.handleUploadUrl,
      access: this.access,
      contentType: args.contentType,
      expiresAt: new Date(Date.now() + args.expiresInSeconds * 1000),
    };
  }

  async createSignedDownloadUrl(args: {
    tenantId: string;
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<SignedDownload> {
    const metadata = await head(args.objectKey, {
      ...(this.token ? { token: this.token } : {}),
    });

    return {
      url: metadata.downloadUrl,
      expiresAt: new Date(Date.now() + args.expiresInSeconds * 1000),
    };
  }

  async headObject(args: { tenantId: string; objectKey: string }): Promise<HeadObject> {
    try {
      const metadata = await head(args.objectKey, {
        ...(this.token ? { token: this.token } : {}),
      });

      return {
        exists: true,
        ...(metadata.size ? { sizeBytes: metadata.size } : {}),
        ...(metadata.contentType ? { contentType: metadata.contentType } : {}),
        ...(metadata.etag ? { etag: metadata.etag } : {}),
      };
    } catch {
      return { exists: false };
    }
  }

  async putObject(args: {
    tenantId: string;
    objectKey: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<{ etag?: string; sizeBytes: number }> {
    const uploaded = await put(args.objectKey, args.bytes, {
      access: this.access,
      addRandomSuffix: false,
      contentType: args.contentType,
      allowOverwrite: true,
      ...(this.token ? { token: this.token } : {}),
    });

    return {
      etag: uploaded.etag,
      sizeBytes: args.bytes.length,
    };
  }

  async getObject(args: { tenantId: string; objectKey: string }): Promise<Buffer> {
    const result = await get(args.objectKey, {
      access: this.access,
      ...(this.token ? { token: this.token } : {}),
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`Blob not found for pathname ${args.objectKey}`);
    }

    return streamToBuffer(result.stream);
  }
}
