import { createIdempotencyKey, request } from "@corely/api-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>({
    url: `${API_BASE_URL}${path}`,
    method: "GET",
  });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>({
    url: `${API_BASE_URL}${path}`,
    method: "POST",
    body,
    idempotencyKey: createIdempotencyKey(),
  });
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>({
    url: `${API_BASE_URL}${path}`,
    method: "PATCH",
    body,
    idempotencyKey: createIdempotencyKey(),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>({
    url: `${API_BASE_URL}${path}`,
    method: "DELETE",
    idempotencyKey: createIdempotencyKey(),
  });
}
