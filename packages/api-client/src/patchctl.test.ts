import { describe, it, expect, vi } from "vitest";
import { createPatchctlClient, PatchctlClientError } from "./patchctl.js";
import { request } from "./http/request.js";

const sourceId = "e1bf2bb3-d983-4a69-b387-1f93124c1a24";
const hash = "a".repeat(64);
const proposal = {
  sourceId,
  schemaVersion: hash,
  reason: "Fix typo",
  records: [{ id: "1", version: "b".repeat(32), changes: { title: "Fixed" } }],
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const config = {
  baseUrl: "https://example.test",
  getAccessToken: () => "agent-key",
};

describe("portable PatchCTL client", () => {
  it("accepts a discovery schema with no readable fields", async () => {
    const client = createPatchctlClient({
      ...config,
      fetch: async () =>
        json({
          definition: {
            namespace: "public",
            table: "articles",
            key: "id",
            isolation: { mode: "row", tenantColumn: "tenant_id" },
            fields: {},
            schedules: [],
          },
          version: hash,
          versionStrategy: "postgres-xmin-and-whole-row",
        }),
    });
    expect((await client.schema(sourceId)).definition.fields).toEqual({});
  });
  it("reads the token per call and isolates concurrent client instances", async () => {
    const transport = vi.fn<typeof fetch>(async () => json([]));
    let token = "first";
    const a = createPatchctlClient({
      ...config,
      getAccessToken: async () => token,
      fetch: transport,
    });
    const b = createPatchctlClient({
      ...config,
      getAccessToken: () => "other-tenant",
      fetch: transport,
    });
    await Promise.all([a.sources(), b.sources()]);
    token = "rotated";
    await a.sources();
    expect(
      transport.mock.calls.map(([, init]) =>
        new Headers(init?.headers).get("Authorization"),
      ),
    ).toEqual(["Bearer first", "Bearer other-tenant", "Bearer rotated"]);
    expect(transport.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      credentials: "omit",
    });
    expect(
      new Headers(transport.mock.calls[0][1]?.headers).has("X-Tenant-Id"),
    ).toBe(false);
  });

  it("supports browser-relative URLs and bounded, encoded pagination", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      json({ targets: [], nextCursor: null }),
    );
    await createPatchctlClient({
      ...config,
      baseUrl: "",
      fetch: transport,
    }).targets("source/a", "category_id", "x&limit=100");
    expect(transport.mock.calls[0][0]).toBe(
      "/api/patchctl/sources/source%2Fa/relations/category_id?after=x%26limit%3D100",
    );
  });

  it("validates input without sending requests and validates successful responses", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      json({ unexpected: true }),
    );
    const client = createPatchctlClient({ ...config, fetch: transport });
    await expect(
      client.propose({ ...proposal, records: [] }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(transport).not.toHaveBeenCalled();
    await expect(client.sources()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects hosted source responses that contain credential-shaped fields", async () => {
    const sourceClient = createPatchctlClient({
      ...config,
      fetch: async () =>
        json([
          {
            id: sourceId,
            name: "Articles",
            password: "must-not-cross-the-boundary",
          },
        ]),
    });
    await expect(sourceClient.sources()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });

    const schemaClient = createPatchctlClient({
      ...config,
      fetch: async () =>
        json({
          definition: {
            namespace: "public",
            table: "articles",
            key: "id",
            isolation: { mode: "row", tenantColumn: "tenant_id" },
            fields: {},
            schedules: [],
          },
          version: hash,
          versionStrategy: "postgres-xmin-and-whole-row",
          connectionString: "postgresql://must-not-cross-the-boundary",
        }),
    });
    await expect(schemaClient.schema(sourceId)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("returns typed proposals with a same-origin review link", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      json({
        id: sourceId,
        revision: hash,
        affectedRecords: 1,
        state: "pending",
        reviewPath: `/patches/${sourceId}`,
      }),
    );
    const result = await createPatchctlClient({
      ...config,
      fetch: transport,
    }).propose(proposal);
    expect(result.reviewUrl).toBe(`https://example.test/patches/${sourceId}`);
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toMatchObject(
      proposal,
    );
    expect(JSON.stringify(result)).not.toContain("agent-key");
  });

  it("rejects unexpected review destinations", async () => {
    const client = createPatchctlClient({
      ...config,
      fetch: async () =>
        json({
          id: sourceId,
          revision: hash,
          state: "pending",
          affectedRecords: 1,
          reviewPath: "https://other.test",
        }),
    });
    await expect(client.propose(proposal)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it.each([401, 403, 409, 500, 503])(
    "preserves HTTP %s and does not retry",
    async (status) => {
      const transport = vi.fn<typeof fetch>(async () =>
        json({ code: "TEST_ERROR", detail: "Safe failure" }, status),
      );
      await expect(
        createPatchctlClient({ ...config, fetch: transport }).sources(),
      ).rejects.toMatchObject({
        status,
        code: "TEST_ERROR",
        message: "Safe failure",
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it("redacts credential-shaped API error details", async () => {
    const canary =
      "postgresql://issue24-user:issue24-password@database.example/content";
    const transport = vi.fn<typeof fetch>(async () =>
      json(
        {
          code: "SOURCE_UNREACHABLE",
          detail: `Database failure for ${canary}`,
        },
        503,
      ),
    );
    const error = await createPatchctlClient({ ...config, fetch: transport })
      .sources()
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(PatchctlClientError);
    expect(String(error)).not.toContain(canary);
    expect(String(error)).not.toContain("issue24-password");
    expect(error).toMatchObject({
      code: "SOURCE_UNREACHABLE",
      status: 503,
      message: "API returned HTTP 503.",
    });
  });

  it("redacts network failures and makes only one attempt", async () => {
    const transport = vi.fn<typeof fetch>(async () => {
      throw new Error("agent-key private URL");
    });
    const error = await createPatchctlClient({ ...config, fetch: transport })
      .sources()
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(PatchctlClientError);
    expect(String(error)).not.toContain("agent-key");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON, including after a successful write, without retry", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response("not-json"));
    await expect(
      createPatchctlClient({ ...config, fetch: transport }).propose(proposal),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("forwards cancellation and a deadline signal", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      init?.signal?.throwIfAborted();
      return json([]);
    });
    const client = createPatchctlClient({
      ...config,
      fetch: transport,
      timeoutMs: 1000,
    });
    await expect(
      client.sources({ signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("does not obtain tokens or fetch for unsafe configuration", () => {
    const getAccessToken = vi.fn(() => "secret");
    for (const baseUrl of [
      "http://remote.test",
      "https://user:secret@example.test",
      "https://example.test/path",
      "https://example.test?token=x",
    ])
      expect(() => createPatchctlClient({ baseUrl, getAccessToken })).toThrow(
        PatchctlClientError,
      );
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("does not fall back to browser cookies or another client's token", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      createPatchctlClient({
        ...config,
        fetch: transport,
        getAccessToken: () => null,
      }).sources(),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("generic transport also honors injected fetch, redirect and credential settings", async () => {
    const transport = vi.fn<typeof fetch>(async () => json({ ok: true }));
    expect(
      await request({
        url: "https://example.test",
        fetch: transport,
        redirect: "error",
        credentials: "omit",
      }),
    ).toEqual({ ok: true });
    expect(transport.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      credentials: "omit",
    });
  });
});
