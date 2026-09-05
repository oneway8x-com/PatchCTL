import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  lstat,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { collectEvidence } from "../collect.mjs";
import {
  loadBundle,
  normalizeXText,
  payloadFingerprint,
  previewResult,
  xTextMetrics,
} from "../bundle.mjs";
import { MarketingError } from "../errors.mjs";
import {
  atomicWriteJson,
  journalPath,
  publicationIdentity,
  readJournal,
  writePublicReceipt,
} from "../journal.mjs";
import {
  publicationStatus,
  publishLive,
  readPolicyConfirmation,
  reconcilePublication,
} from "../publisher.mjs";
import { XurlTransport } from "../xurl.mjs";

const execFile = promisify(execFileCallback);
const TEST_REVISION = "a".repeat(40);
const CHANGED_TEST_REVISION = "b".repeat(40);

async function fixture({
  text = "A reviewed PatchCTL update.",
  mutateManifest,
  ready = true,
} = {}) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "patchctl-marketing-test-"),
  );
  const bundleRoot = path.join(root, "bundle");
  const state = path.join(root, "state");
  await mkdir(bundleRoot, { recursive: true });
  const manifest = {
    version: 1,
    updateId: "test-update",
    timestamp: "2026-09-05T12:00:00Z",
    editorialState: ready ? "ready" : "draft",
    sourceRevision: TEST_REVISION,
    evidence: [
      {
        id: "source-revision",
        kind: "commit",
        status: "verified",
        description: "Fixed source revision.",
        revision: TEST_REVISION,
        checkedAt: "2026-09-05T12:00:00Z",
      },
    ],
    claims: [
      { text: "This is a test update.", evidenceIds: ["source-revision"] },
    ],
    channels: {
      x: {
        path: "x.txt",
        intendedAccount: "@PatchCTLTest",
        destination: "timeline",
        options: {},
        blockers: [],
      },
      reddit: {
        path: "reddit.md",
        intendedCommunity: "r/test",
        rulesCheckedAt: "2026-09-05T12:00:00Z",
        blockers: [],
      },
    },
    aiAssistance: {
      used: true,
      disclosure: "Drafted with AI assistance; human review required.",
      humanReviewRequired: true,
    },
    blockers: [],
  };
  mutateManifest?.(manifest);
  await writeFile(
    path.join(bundleRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    path.join(bundleRoot, "update.md"),
    "# Update\n\nEvidence-backed narrative.\n",
  );
  await writeFile(path.join(bundleRoot, "x.txt"), `${text}\n`);
  await writeFile(
    path.join(bundleRoot, "reddit.md"),
    "# Useful test title\n\nAffiliation: PatchCTL maintainer.\n\nStandalone body.\n",
  );
  await mkdir(state, { recursive: true, mode: 0o700 });
  await atomicWriteJson(path.join(state, "publisher-policy.json"), {
    version: 1,
    project: "PatchCTL",
    xurlVersion: "1.3.1",
    platformPolicyConfirmedAt: "2026-09-05T12:00:00Z",
    useCase: "human-approved-standalone-ai-assisted-text",
  });
  const bundle = await loadBundle(bundleRoot, {
    repoRoot: root,
    verifyEvidencePaths: false,
  });
  return { root, bundleRoot, state, bundle };
}

class FakeTransport {
  constructor({
    username = "PatchCTLTest",
    postError,
    postId = "1234567890",
    gate,
  } = {}) {
    this.username = username;
    this.postError = postError;
    this.postId = postId;
    this.gate = gate;
    this.posts = [];
  }
  async verifyVersion() {}
  async identity() {
    return { id: "42", username: this.username };
  }
  async post(text, account) {
    this.posts.push({ text, account });
    if (this.gate) await this.gate;
    if (this.postError) throw this.postError;
    return { id: this.postId, text };
  }
}

async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof MarketingError && error.code === code,
  );
}

test("validates a strict manifest and evidence references", async () => {
  const { bundle } = await fixture();
  assert.equal(bundle.manifest.claims[0].evidenceIds[0], "source-revision");
  const invalid = await fixture({
    mutateManifest: (manifest) => {
      manifest.claims[0].evidenceIds = ["missing"];
    },
  }).catch((error) => error);
  assert.equal(invalid.code, "INVALID_MANIFEST");
  const unsupported = await fixture({
    mutateManifest: (manifest) => {
      manifest.authorization = true;
    },
  }).catch((error) => error);
  assert.equal(unsupported.code, "INVALID_MANIFEST");
  const invalidAccount = await fixture({
    mutateManifest: (manifest) => {
      manifest.channels.x.intendedAccount = "user:secret@x.com/path";
    },
  }).catch((error) => error);
  assert.equal(invalidAccount.code, "INVALID_MANIFEST");
});

test("resolves the manifest and verified source evidence to Git commits", async () => {
  const { root, bundleRoot } = await fixture();
  await execFile("git", ["init", "-q"], { cwd: root });
  await execFile("git", ["config", "user.email", "fixture@example.invalid"], {
    cwd: root,
  });
  await execFile("git", ["config", "user.name", "Fixture"], { cwd: root });
  await writeFile(path.join(root, "evidence.txt"), "verified evidence\n");
  await execFile("git", ["add", "evidence.txt"], { cwd: root });
  await execFile("git", ["commit", "-q", "-m", "evidence"], { cwd: root });
  const revision = (
    await execFile("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  const manifestPath = path.join(bundleRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.sourceRevision = revision;
  manifest.evidence[0] = {
    id: "source-revision",
    kind: "source",
    status: "verified",
    description: "Verified source path at the source revision.",
    path: "evidence.txt",
    revision,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const verified = await loadBundle(bundleRoot, { repoRoot: root });
  assert.equal(verified.manifest.sourceRevision, revision);

  const branch = (
    await execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: root,
    })
  ).stdout.trim();
  manifest.sourceRevision = branch;
  manifest.evidence[0].revision = branch;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await expectCode(
    loadBundle(bundleRoot, { repoRoot: root }),
    "INVALID_BUNDLE",
  );

  manifest.sourceRevision = "does-not-exist";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await expectCode(
    loadBundle(bundleRoot, { repoRoot: root }),
    "INVALID_BUNDLE",
  );
});

test("rejects traversal and unexpected symbolic links", async () => {
  const traversal = await fixture({
    mutateManifest: (manifest) => {
      manifest.channels.x.path = "../outside.txt";
    },
  }).catch((error) => error);
  assert.equal(traversal.code, "UNSAFE_PATH");
  const { root, bundleRoot } = await fixture();
  await writeFile(path.join(root, "outside.txt"), "outside");
  await writeFile(
    path.join(bundleRoot, "manifest.json"),
    JSON.stringify({
      version: 1,
      updateId: "test-update",
      timestamp: "2026-09-05T12:00:00Z",
      editorialState: "draft",
      sourceRevision: "abc",
      evidence: [
        {
          id: "e",
          kind: "commit",
          status: "verified",
          description: "revision",
          revision: "abc",
        },
      ],
      claims: [{ text: "claim", evidenceIds: ["e"] }],
      channels: {
        x: {
          path: "linked.txt",
          intendedAccount: "unconfigured",
          destination: "timeline",
          options: {},
          blockers: ["blocked"],
        },
        reddit: {
          path: "reddit.md",
          intendedCommunity: "unselected",
          rulesCheckedAt: null,
          blockers: ["blocked"],
        },
      },
      aiAssistance: {
        used: true,
        disclosure: "AI assisted; human review required.",
        humanReviewRequired: true,
      },
      blockers: ["draft"],
    }),
  );
  await symlink(
    path.join(root, "outside.txt"),
    path.join(bundleRoot, "linked.txt"),
  );
  await expectCode(
    loadBundle(bundleRoot, { repoRoot: root, verifyEvidencePaths: false }),
    "UNSAFE_PATH",
  );
});

test("uses weighted X rules for Unicode, emoji, URLs, and NFC normalization", () => {
  assert.equal(normalizeXText("cafe\u0301\r\n"), "café");
  assert.equal(xTextMetrics("👨‍👩‍👧‍👦").weightedLength, 2);
  assert.equal(
    xTextMetrics("a https://example.com/a/very/long/path").weightedLength,
    25,
  );
  assert.equal(xTextMetrics("界").weightedLength, 2);
});

test("offline preview treats malicious-looking text as data", async () => {
  const marker = path.join(
    os.tmpdir(),
    `patchctl-should-not-exist-${Date.now()}`,
  );
  const text = `$(touch ${marker}) && echo hacked`;
  const { bundle } = await fixture({ text });
  const preview = previewResult(bundle, "x");
  assert.equal(preview.text, text);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
});

test("fingerprint binds normalized content, update, revision, and publication fields", async () => {
  const { bundle } = await fixture({ text: "cafe\u0301" });
  const approved = {
    updateId: "test-update",
    sourceRevision: TEST_REVISION,
    channel: "x",
    intendedAccount: "@patchctltest",
    destination: "timeline",
    options: {},
    text: "café",
  };
  const same = payloadFingerprint(approved);
  assert.equal(bundle.xFingerprint, same);
  assert.notEqual(
    payloadFingerprint({ ...approved, text: "café changed" }),
    same,
  );
  assert.notEqual(
    payloadFingerprint({ ...approved, updateId: "another-update" }),
    same,
  );
  assert.notEqual(
    payloadFingerprint({ ...approved, sourceRevision: CHANGED_TEST_REVISION }),
    same,
  );
});

test("requires a current strict-UTC publisher policy confirmation", async () => {
  const { state } = await fixture();
  const policyPath = path.join(state, "publisher-policy.json");
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  const now = () => new Date("2026-09-05T12:00:00Z");
  await readPolicyConfirmation(state, { now });

  for (const timestamp of [
    "2026-08-05T11:59:59Z",
    "2026-09-05T12:05:01Z",
    "2026-09-05T12:00:00+00:00",
  ]) {
    await atomicWriteJson(policyPath, {
      ...policy,
      platformPolicyConfirmedAt: timestamp,
    });
    await expectCode(
      readPolicyConfirmation(state, { now }),
      "POLICY_NOT_CONFIRMED",
    );
  }
});

test("rechecks policy freshness after interactive confirmation", async () => {
  const { bundle, state } = await fixture();
  let current = new Date("2026-09-05T12:00:00Z");
  const transport = new FakeTransport();
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport,
      now: () => current,
      confirm: async () => {
        current = new Date("2026-10-06T12:00:01Z");
        return true;
      },
    }),
    "POLICY_NOT_CONFIRMED",
  );
  assert.equal(transport.posts.length, 0);
});

test("refuses account mismatch and missing human confirmation", async () => {
  const { bundle, state } = await fixture();
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport: new FakeTransport({ username: "WrongAccount" }),
      confirm: async () => true,
    }),
    "ACCOUNT_MISMATCH",
  );
  const transport = new FakeTransport();
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport,
      confirm: async () => false,
    }),
    "POLICY_NOT_CONFIRMED",
  );
  assert.equal(transport.posts.length, 0);
});

test("refuses content changed after preview", async () => {
  const { bundle, state } = await fixture();
  await expectCode(
    publishLive(bundle, "0".repeat(64), {
      root: state,
      transport: new FakeTransport(),
      confirm: async () => true,
    }),
    "CONTENT_CHANGED",
  );
});

test("creates a confirmed journal entry and sanitized public receipt", async () => {
  const { bundle, state } = await fixture();
  const transport = new FakeTransport();
  const result = await publishLive(bundle, bundle.xFingerprint, {
    root: state,
    transport,
    confirm: async () => true,
    now: () => new Date("2026-09-05T13:00:00Z"),
  });
  assert.equal(result.publicPostId, "1234567890");
  assert.equal(transport.posts.length, 1);
  const receipt = JSON.parse(await readFile(result.receiptPath, "utf8"));
  assert.deepEqual(
    Object.keys(receipt).sort(),
    [
      "channel",
      "destinationAccount",
      "payloadFingerprint",
      "publicPostId",
      "publicUrl",
      "publishedAt",
      "sourceRevision",
      "updateId",
      "version",
    ].sort(),
  );
  assert.equal(receipt.payloadFingerprint, bundle.xFingerprint);
  assert.equal(receipt.sourceRevision, TEST_REVISION);
});

test("prevents duplicates after restart", async () => {
  const { bundle, state } = await fixture();
  await publishLive(bundle, bundle.xFingerprint, {
    root: state,
    transport: new FakeTransport(),
    confirm: async () => true,
  });
  const restarted = new FakeTransport();
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport: restarted,
      confirm: async () => true,
    }),
    "ALREADY_PUBLISHED",
  );
  assert.equal(restarted.posts.length, 0);
});

test("blocks unknown and impossible terminal journal attempts", async () => {
  const { bundle, state } = await fixture();
  const identity = publicationIdentity(bundle);
  const malformedAttempts = [
    [{ status: "publised" }],
    [
      {
        id: "00000000-0000-4000-8000-000000000000",
        fingerprint: bundle.xFingerprint,
        sourceRevision: bundle.manifest.sourceRevision,
        status: "reconciled-no-post",
        startedAt: "2026-09-05T12:00:00Z",
        completedAt: "2026-09-05T12:00:00Z",
        remote: null,
        error: null,
        history: [
          {
            status: "reconciled-no-post",
            at: "2026-09-05T12:00:00Z",
            reason: "Fabricated terminal state without a pending attempt.",
          },
        ],
      },
    ],
  ];
  for (const attempts of malformedAttempts) {
    await atomicWriteJson(journalPath(state, identity), {
      version: 1,
      identity,
      attempts,
    });
    const transport = new FakeTransport();
    await expectCode(
      publishLive(bundle, bundle.xFingerprint, {
        root: state,
        transport,
        confirm: async () => true,
      }),
      "PUBLISH_OUTCOME_UNKNOWN",
    );
    assert.equal(transport.posts.length, 0);
  }
});

test("serializes concurrent attempts with a cross-process lock", async () => {
  const { bundle, state } = await fixture();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const firstTransport = new FakeTransport({ gate });
  const first = publishLive(bundle, bundle.xFingerprint, {
    root: state,
    transport: firstTransport,
    confirm: async () => true,
  });
  while (firstTransport.posts.length === 0)
    await new Promise((resolve) => setTimeout(resolve, 5));
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport: new FakeTransport(),
      confirm: async () => true,
    }),
    "PUBLISH_IN_PROGRESS",
  );
  release();
  await first;
});

test("records malformed transport success IDs as readable ambiguous state", async () => {
  const { bundle, state } = await fixture();
  const transport = new FakeTransport({ postId: "not-a-post-id" });
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport,
      confirm: async () => true,
    }),
    "PUBLISH_OUTCOME_UNKNOWN",
  );
  assert.equal(transport.posts.length, 1);
  const status = await publicationStatus(bundle, { root: state });
  assert.equal(status.attempts.at(-1).status, "unknown");
});

test("records ambiguous outcomes and reconciles without reposting", async () => {
  const { bundle, state } = await fixture();
  const transport = new FakeTransport({
    postError: new MarketingError(
      "PUBLISH_OUTCOME_UNKNOWN",
      "socket closed after send",
    ),
  });
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport,
      confirm: async () => true,
    }),
    "PUBLISH_OUTCOME_UNKNOWN",
  );
  let status = await publicationStatus(bundle, { root: state });
  assert.equal(status.attempts.at(-1).status, "unknown");
  const result = await reconcilePublication(
    bundle,
    {
      remoteId: "555",
      remoteUrl: "https://x.com/PatchCTLTest/status/555",
      publishedAt: "2026-09-05T14:00:00Z",
    },
    { root: state, confirm: async () => true },
  );
  assert.equal(result.outcome, "published");
  assert.equal(transport.posts.length, 1);
  status = await publicationStatus(bundle, { root: state });
  assert.equal(status.attempts.at(-1).status, "published");
});

test("rejects noncanonical reconciliation URLs without resolving the attempt", async () => {
  const { bundle, state } = await fixture();
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport: new FakeTransport({
        postError: new MarketingError("PUBLISH_OUTCOME_UNKNOWN", "timeout"),
      }),
      confirm: async () => true,
    }),
    "PUBLISH_OUTCOME_UNKNOWN",
  );
  for (const remoteUrl of [
    "https://x.com/PatchCTLTest/status/555?tracking=1",
    "https://x.com/PatchCTLTest/status/555#fragment",
    "https://user:secret@x.com/PatchCTLTest/status/555",
    "https://x.com:8443/PatchCTLTest/status/555",
  ]) {
    await expectCode(
      reconcilePublication(
        bundle,
        {
          remoteId: "555",
          remoteUrl,
          publishedAt: "2026-09-05T14:00:00Z",
        },
        { root: state, confirm: async () => true },
      ),
      "INVALID_COMMAND",
    );
  }
  const status = await publicationStatus(bundle, { root: state });
  assert.equal(status.attempts.at(-1).status, "unknown");
});

test("refuses reconciliation when payload or source revision changed", async () => {
  for (const change of ["payload", "source"]) {
    const { bundle, bundleRoot, state } = await fixture();
    await expectCode(
      publishLive(bundle, bundle.xFingerprint, {
        root: state,
        transport: new FakeTransport({
          postError: new MarketingError("PUBLISH_OUTCOME_UNKNOWN", "timeout"),
        }),
        confirm: async () => true,
      }),
      "PUBLISH_OUTCOME_UNKNOWN",
    );
    if (change === "payload")
      await writeFile(path.join(bundleRoot, "x.txt"), "Changed payload.\n");
    else {
      const manifestPath = path.join(bundleRoot, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.sourceRevision = CHANGED_TEST_REVISION;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const changedBundle = await loadBundle(bundleRoot, {
      verifyEvidencePaths: false,
    });
    await expectCode(
      reconcilePublication(
        changedBundle,
        { noPost: true, reason: "Independent verification." },
        { root: state, confirm: async () => true },
      ),
      "CONTENT_CHANGED",
    );
  }
});

test("preserves an explicit no-post reconciliation decision", async () => {
  const { bundle, state } = await fixture();
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport: new FakeTransport({
        postError: new MarketingError("PUBLISH_OUTCOME_UNKNOWN", "timeout"),
      }),
      confirm: async () => true,
    }),
    "PUBLISH_OUTCOME_UNKNOWN",
  );
  const result = await reconcilePublication(
    bundle,
    {
      noPost: true,
      reason:
        "Operator verified the account timeline and provider support confirmed no create.",
    },
    { root: state, confirm: async () => true },
  );
  assert.equal(result.outcome, "no-post");
  const status = await publicationStatus(bundle, { root: state });
  assert.match(
    status.attempts.at(-1).history.at(-1).reason,
    /Operator independently determined/,
  );
});

test("records definitive API rejection without retrying", async () => {
  const { bundle, state } = await fixture();
  const transport = new FakeTransport({
    postError: new MarketingError("DEFINITIVE_API_ERROR", "rejected", {
      reason: "rate limited",
      retryAfter: "later",
    }),
  });
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport,
      confirm: async () => true,
    }),
    "DEFINITIVE_API_ERROR",
  );
  const status = await publicationStatus(bundle, { root: state });
  assert.equal(status.attempts.at(-1).status, "rejected");
  assert.equal(transport.posts.length, 1);
});

test("leaves a blocking pending attempt when journal persistence fails after remote success", async () => {
  const { bundle, state } = await fixture();
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport: new FakeTransport(),
      confirm: async () => true,
      journalFailurePoint: "after-send",
    }),
    "PUBLISH_OUTCOME_UNKNOWN",
  );
  const { journal } = await readJournal(state, publicationIdentity(bundle));
  assert.equal(journal.attempts.at(-1).status, "pending");
});

test("keeps confirmed authoritative state when public receipt persistence fails", async () => {
  const { bundle, state } = await fixture();
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport: new FakeTransport(),
      confirm: async () => true,
      receiptFailurePoint: "before-rename",
    }),
    "RECEIPT_WRITE_FAILED",
  );
  const status = await publicationStatus(bundle, { root: state });
  assert.equal(status.attempts.at(-1).status, "published");
});

test("repairs a missing receipt without posting and rejects conflicts", async () => {
  const { bundle, state } = await fixture();
  const transport = new FakeTransport();
  await expectCode(
    publishLive(bundle, bundle.xFingerprint, {
      root: state,
      transport,
      confirm: async () => true,
      receiptFailurePoint: "before-rename",
    }),
    "RECEIPT_WRITE_FAILED",
  );
  const options = { repairReceipt: true };
  const context = { root: state, confirm: async () => true };
  const repaired = await reconcilePublication(bundle, options, context);
  assert.equal(repaired.outcome, "receipt-repaired");
  assert.equal(transport.posts.length, 1);
  assert.equal(
    JSON.parse(await readFile(repaired.receiptPath, "utf8")).publicPostId,
    "1234567890",
  );

  const repeated = await reconcilePublication(bundle, options, context);
  assert.equal(repeated.receiptPath, repaired.receiptPath);
  assert.equal(transport.posts.length, 1);

  await writeFile(repaired.receiptPath, '{"conflict":true}\n');
  await expectCode(
    reconcilePublication(bundle, options, context),
    "RECEIPT_WRITE_FAILED",
  );
  assert.equal(transport.posts.length, 1);
});

test("atomically refuses concurrent conflicting receipts", async () => {
  const { bundle, bundleRoot } = await fixture();
  await writeFile(path.join(bundleRoot, "x.txt"), "Different reviewed text.\n");
  const changedBundle = await loadBundle(bundleRoot, {
    verifyEvidencePaths: false,
  });
  const remote = {
    id: "777",
    url: "https://x.com/PatchCTLTest/status/777",
    publishedAt: "2026-09-05T14:00:00Z",
  };
  const results = await Promise.allSettled([
    writePublicReceipt(bundle, remote),
    writePublicReceipt(changedBundle, remote),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.code, "RECEIPT_WRITE_FAILED");
  const receipt = JSON.parse(
    await readFile(path.join(bundleRoot, "publications", "x-777.json"), "utf8"),
  );
  assert.ok(
    [bundle.xFingerprint, changedBundle.xFingerprint].includes(
      receipt.payloadFingerprint,
    ),
  );
});

test("xurl wrapper uses fixed argv without a shell and redacts fake credentials", async () => {
  const calls = [];
  const runner = async (executable, args, options) => {
    calls.push({ executable, args, options });
    if (args[0] === "version")
      return { stdout: "xurl version 1.3.1\n", stderr: "" };
    if (args.includes("/2/users/me"))
      return {
        stdout: JSON.stringify({
          data: { id: "42", username: "PatchCTLTest" },
        }),
        stderr: "",
      };
    return {
      stdout: JSON.stringify({ data: { id: "7", text: args[3] } }),
      stderr: "",
    };
  };
  const transport = new XurlTransport({ runner });
  await transport.verifyVersion();
  const identity = await transport.identity("@PatchCTLTest");
  assert.deepEqual(identity, { id: "42", username: "PatchCTLTest" });
  assert.deepEqual(calls[1].args, [
    "--app",
    "patchctl-marketing",
    "--username",
    "PatchCTLTest",
    "--auth",
    "oauth2",
    "/2/users/me",
  ]);
  await transport.post("$(not executed); token=still-data", "@PatchCTLTest");
  assert.equal(
    calls.every(
      (call) => call.executable === "xurl" && call.options.shell === false,
    ),
    true,
  );
  assert.equal(
    calls.at(-1).args.includes("$(not executed); token=still-data"),
    true,
  );

  const failing = new XurlTransport({
    runner: async () => {
      const error = new Error("failed");
      error.stderr = "Authorization: bearer-value token=fake-token-value";
      throw error;
    },
  });
  const error = await failing.identity("@PatchCTLTest").catch((value) => value);
  assert.equal(error.code, "AUTH_NOT_CONFIGURED");
  assert.doesNotMatch(
    JSON.stringify(error.details),
    /bearer-value|fake-token-value/,
  );

  for (const stdout of ["{}", JSON.stringify({ data: { id: "99" } })]) {
    const ambiguous = new XurlTransport({
      runner: async () => {
        const failure = new Error("nonzero exit");
        failure.stdout = stdout;
        throw failure;
      },
    });
    await expectCode(
      ambiguous.post("reviewed text", "@PatchCTLTest"),
      "PUBLISH_OUTCOME_UNKNOWN",
    );
  }
  const rejected = new XurlTransport({
    runner: async () => {
      const failure = new Error("nonzero exit");
      failure.stdout = JSON.stringify({
        errors: [{ status: 400, code: "invalid_request", detail: "bad" }],
      });
      throw failure;
    },
  });
  await expectCode(
    rejected.post("reviewed text", "@PatchCTLTest"),
    "DEFINITIVE_API_ERROR",
  );
});

test("bounded collection treats commit messages as data and does not execute them", async () => {
  const repository = await mkdtemp(
    path.join(os.tmpdir(), "patchctl-marketing-git-"),
  );
  await execFile("git", ["init", "-q"], { cwd: repository });
  await execFile("git", ["config", "user.email", "fixture@example.invalid"], {
    cwd: repository,
  });
  await execFile("git", ["config", "user.name", "Fixture"], {
    cwd: repository,
  });
  await writeFile(path.join(repository, "file.txt"), "one");
  await execFile("git", ["add", "file.txt"], { cwd: repository });
  await execFile("git", ["commit", "-q", "-m", "base"], { cwd: repository });
  const base = (
    await execFile("git", ["rev-parse", "HEAD"], { cwd: repository })
  ).stdout.trim();
  const marker = path.join(repository, "executed");
  await writeFile(path.join(repository, "file.txt"), "two");
  await execFile("git", ["add", "file.txt"], { cwd: repository });
  await execFile(
    "git",
    ["commit", "-q", "-m", `$(touch ${marker}) token=fake-secret-value`],
    { cwd: repository },
  );
  const result = await collectEvidence(base, { cwd: repository });
  assert.match(result.commits[0].subject, /\$\(touch/);
  assert.doesNotMatch(result.commits[0].subject, /fake-secret-value/);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
});

test("offline CLI export works and Reddit live publication is refused", async () => {
  const { bundleRoot } = await fixture();
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const revision = (
    await execFile("git", ["rev-parse", "HEAD"], { cwd: repository })
  ).stdout.trim();
  const manifestPath = path.join(bundleRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.sourceRevision = revision;
  manifest.evidence[0].revision = revision;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));
  const exported = await execFile(
    process.execPath,
    [cli, "export", bundleRoot, "--channel", "reddit"],
    { cwd: repository, encoding: "utf8" },
  );
  assert.match(exported.stdout, /^# Useful test title/);
  const refusal = await execFile(
    process.execPath,
    [
      cli,
      "publish",
      bundleRoot,
      "--channel",
      "reddit",
      "--live",
      "--expected-hash",
      "0".repeat(64),
    ],
    { encoding: "utf8" },
  ).catch((error) => error);
  assert.equal(refusal.code, 3);
  assert.match(refusal.stderr, /CHANNEL_MANUAL_ONLY/);
});

test("skills, compatibility links, commands, and archive links are valid", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const skills = ["build-in-public", "marketing-publish"];
  for (const name of skills) {
    const canonical = path.join(
      repository,
      ".agents",
      "skills",
      name,
      "SKILL.md",
    );
    const content = await readFile(canonical, "utf8");
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(frontmatter, `${name} frontmatter`);
    assert.match(frontmatter[1], new RegExp(`^name: ${name}$`, "m"));
    assert.match(frontmatter[1], /^description: .+$/m);
    assert.doesNotMatch(
      frontmatter[1],
      /allowed-tools|disable-model-invocation/,
    );
    const compatibility = path.join(repository, ".claude", "skills", name);
    assert.equal((await lstat(compatibility)).isSymbolicLink(), true);
    assert.equal(await readlink(compatibility), `../../.agents/skills/${name}`);
  }
  const openai = await readFile(
    path.join(
      repository,
      ".agents",
      "skills",
      "marketing-publish",
      "agents",
      "openai.yaml",
    ),
    "utf8",
  );
  assert.match(openai, /allow_implicit_invocation: false/);
  const claudeSettings = JSON.parse(
    await readFile(path.join(repository, ".claude", "settings.json"), "utf8"),
  );
  assert.equal(
    claudeSettings.skillOverrides["marketing-publish"],
    "user-invocable-only",
  );
  const packageJson = JSON.parse(
    await readFile(path.join(repository, "package.json"), "utf8"),
  );
  assert.equal(packageJson.scripts.marketing, "node scripts/marketing/cli.mjs");
  assert.equal(
    packageJson.scripts["marketing:test"],
    "node --test scripts/marketing/__tests__/*.test.mjs",
  );
  const marketingReadme = await readFile(
    path.join(repository, "marketing", "README.md"),
    "utf8",
  );
  for (const command of [
    "pnpm marketing collect",
    "pnpm marketing validate",
    "pnpm marketing preview",
    "pnpm marketing export",
    "pnpm marketing publish",
    "pnpm marketing status",
    "pnpm marketing reconcile",
    "pnpm marketing:test",
  ])
    assert.match(marketingReadme, new RegExp(command.replace(":", "\\:")));
  const rootReadme = await readFile(path.join(repository, "README.md"), "utf8");
  assert.match(
    rootReadme,
    /\[build-in-public archive and workflow\]\(marketing\/README\.md\)/,
  );
  const archive = await readFile(
    path.join(repository, "marketing", "build-in-public", "README.md"),
    "utf8",
  );
  assert.match(archive, /\(2026-09-05-local-first-review\/update\.md\)/);
});

test("all local links in marketing docs and new skills resolve", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const roots = [
    path.join(repository, "marketing"),
    path.join(repository, ".agents", "skills", "build-in-public"),
    path.join(repository, ".agents", "skills", "marketing-publish"),
  ];
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() && target.endsWith(".md")) files.push(target);
    }
  }
  for (const root of roots) await walk(root);
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1].split("#")[0];
      if (!link || /^(https?:|mailto:)/.test(link)) continue;
      const target = path.resolve(path.dirname(file), decodeURIComponent(link));
      assert.ok(
        await lstat(target),
        `${path.relative(repository, file)} -> ${link}`,
      );
    }
  }
});

test("rejects oversized channel input before processing", async () => {
  const error = await fixture({ text: "x".repeat(70 * 1024) }).catch(
    (value) => value,
  );
  assert.equal(error.code, "INVALID_BUNDLE");
  assert.match(error.message, /size limit/);
});
