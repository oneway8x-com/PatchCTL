import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createPatchctlClient } from "@corely/api-client/patchctl";
import {
  request,
  HttpError,
  normalizeError,
  subscribeSse,
} from "@corely/api-client";

test("compiled root/subpath exports load in plain Node with no TS loader", () => {
  for (const fn of [
    request,
    HttpError,
    normalizeError,
    subscribeSse,
    createPatchctlClient,
  ])
    assert.equal(typeof fn, "function");
});

test("real HTTP blocks redirects and times out without retrying", async () => {
  let requests = 0;
  let destinationHits = 0;
  const server = createServer((req, res) => {
    requests++;
    if (req.url === "/redirected") {
      destinationHits++;
      res.end("[]");
    } else if (requests === 1) {
      res.writeHead(302, { Location: "/redirected" });
      res.end();
    }
    // The second request deliberately never sends headers.
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const client = createPatchctlClient({
      baseUrl,
      getAccessToken: () => "test-only",
      timeoutMs: 2000,
    });
    await assert.rejects(client.sources(), { code: "NETWORK_ERROR" });
    await assert.rejects(
      createPatchctlClient({
        baseUrl,
        getAccessToken: () => "test-only",
        timeoutMs: 100,
      }).sources(),
      { code: "NETWORK_ERROR" },
    );
    assert.equal(requests, 2);
    assert.equal(destinationHits, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
