import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./dist/cli.js";
const proposal = {
  sourceId: "e1bf2bb3-d983-4a69-b387-1f93124c1a24",
  schemaVersion: "a".repeat(64),
  reason: "Fix typo",
  records: [{ id: "1", version: "b".repeat(32), changes: { title: "Fixed" } }],
};
async function invoke(
  args,
  input = "",
  response,
  env = {
    PATCHCTL_URL: "https://example.test",
    PATCHCTL_TOKEN: "private-token",
  },
) {
  let stdout = "",
    stderr = "";
  const calls = [];
  const code = await run(args, {
    env,
    stdin: Readable.from([input]),
    stdout: {
      write: (value) => {
        stdout += value;
      },
    },
    stderr: {
      write: (value) => {
        stderr += value;
      },
    },
    fetchImpl: async (...args) => {
      calls.push(args);
      if (response instanceof Error) throw response;
      if (response instanceof Response) return response;
      const fallback = args[0].endsWith("/records/query")
        ? { records: [], nextCursor: null, schemaVersion: "a".repeat(64) }
        : args[0].includes("/relations/")
          ? { targets: [], nextCursor: null }
          : [];
      return new Response(
        JSON.stringify(response ? await response.json() : fallback),
        {
          status: response?.status ?? 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  });
  return { code, stdout, stderr, calls };
}
test("local validation parses stdin without credentials or API calls", async () => {
  const result = await invoke(
    ["validate", "--stdin"],
    JSON.stringify(proposal),
    undefined,
    {},
  );
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).affectedRecords, 1);
  assert.equal(result.calls.length, 0);
});
test("reads a JSON file and rejects malformed JSON and flags", async () => {
  const dir = await mkdtemp(join(tmpdir(), "patchctl-cli-"));
  const file = join(dir, "proposal.json");
  try {
    await writeFile(file, JSON.stringify(proposal));
    assert.equal((await invoke(["validate", "--file", file])).code, 0);
    assert.equal((await invoke(["validate", "--stdin"], "{broken")).code, 2);
    assert.equal(
      (await invoke(["validate", "--stdin", "--file", file])).code,
      2,
    );
    assert.equal((await invoke(["sources", "--unknown"])).code, 2);
  } finally {
    await unlink(file);
    await rmdir(dir);
  }
});
test("submission returns review URL and sends credentials only in the authorization header", async () => {
  const result = await invoke(
    ["propose", "--stdin"],
    JSON.stringify(proposal),
    {
      ok: true,
      json: async () => ({
        id: "patch",
        revision: "a".repeat(64),
        affectedRecords: 1,
        state: "pending",
        reviewPath: "/patches/patch",
      }),
    },
  );
  assert.equal(result.code, 0);
  assert.equal(
    JSON.parse(result.stdout).reviewUrl,
    "https://example.test/patches/patch",
  );
  assert.equal(
    result.calls[0][1].headers.Authorization,
    "Bearer private-token",
  );
  assert.equal(new URL(result.calls[0][0]).pathname, "/api/patchctl/patches");
  assert.ok(!result.stdout.includes("private-token"));
});
test("read preserves pagination/filter inputs and uses only the read endpoint", async () => {
  const result = await invoke(
    ["read", "source", "--stdin", "--after", "050", "--limit", "50"],
    JSON.stringify({ filters: [{ field: "summary_en", op: "missing" }] }),
  );
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.calls[0][1].body), {
    filters: [{ field: "summary_en", op: "missing" }],
    after: "050",
    limit: 50,
  });
  assert.equal(
    new URL(result.calls[0][0]).pathname,
    "/api/patchctl/sources/source/records/query",
  );
});
test("reports authentication and conflict exit codes", async () => {
  assert.equal(
    (
      await invoke(["sources"], "", {
        ok: false,
        status: 401,
        json: async () => ({ code: "UNAUTHENTICATED" }),
      })
    ).code,
    3,
  );
  assert.equal(
    (
      await invoke(["propose", "--stdin"], JSON.stringify(proposal), {
        ok: false,
        status: 409,
        json: async () => ({ code: "STALE_RECORD" }),
      })
    ).code,
    4,
  );
});

test("rejects non-object read input before any request", async () => {
  for (const input of [null, [], "text", 1]) {
    const result = await invoke(
      ["read", "source", "--stdin"],
      JSON.stringify(input),
    );
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.stderr).error.code, "INVALID_INPUT");
    assert.equal(result.calls.length, 0);
  }
});

test("narrows unknown API error bodies without changing HTTP exit codes", async () => {
  for (const body of [null, [], { detail: 123, code: false }]) {
    const result = await invoke(["sources"], "", {
      ok: false,
      status: 403,
      json: async () => body,
    });
    assert.equal(result.code, 3);
    assert.deepEqual(JSON.parse(result.stderr), {
      error: { code: "API_ERROR", message: "API returned HTTP 403." },
    });
  }
});

test("discovers relation targets without write requests and preserves pagination", async () => {
  const result = await invoke([
    "targets",
    "source",
    "category_id",
    "--after",
    "cat-1",
  ]);
  assert.equal(result.code, 0);
  assert.equal(
    new URL(result.calls[0][0]).pathname,
    "/api/patchctl/sources/source/relations/category_id",
  );
  assert.equal(new URL(result.calls[0][0]).searchParams.get("after"), "cat-1");
  assert.equal(result.calls[0][1].method, "GET");
});
test("does not retry network errors or print secret-bearing exception text", async () => {
  const result = await invoke(
    ["sources"],
    "",
    new Error("private-token connection refused"),
  );
  assert.equal(result.code, 5);
  assert.equal(result.calls.length, 1);
  assert.ok(!result.stderr.includes("private-token"));
});

test("maps invalid JSON and response contracts to exit 5 without retry", async () => {
  for (const response of [
    new Response("not-json"),
    new Response(JSON.stringify({ unexpected: true })),
  ]) {
    const result = await invoke(["sources"], "", response);
    assert.equal(result.code, 5);
    assert.equal(JSON.parse(result.stderr).error.code, "INVALID_RESPONSE");
    assert.equal(result.calls.length, 1);
  }
});
test("offers no agent approval/apply override", async () => {
  for (const command of ["approve", "apply", "sql", "delete"]) {
    const result = await invoke([command, "patch"]);
    assert.equal(result.code, 2);
    assert.equal(result.calls.length, 0);
  }
});
test("rejects insecure remote origins and oversized input", async () => {
  assert.equal(
    (
      await invoke(["sources"], "", undefined, {
        PATCHCTL_URL: "http://example.test",
        PATCHCTL_TOKEN: "token",
      })
    ).code,
    2,
  );
  assert.equal(
    (await invoke(["validate", "--stdin"], "x".repeat(2_000_001))).code,
    2,
  );
});
