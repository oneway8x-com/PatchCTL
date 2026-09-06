import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import twitterText from "twitter-text";
import { MarketingError } from "./errors.mjs";

const execFile = promisify(execFileCallback);
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_NARRATIVE_BYTES = 256 * 1024;
const MAX_CHANNEL_BYTES = 64 * 1024;
const ROOT_FIELDS = [
  "version",
  "updateId",
  "timestamp",
  "editorialState",
  "sourceRevision",
  "evidence",
  "claims",
  "channels",
  "aiAssistance",
  "blockers",
];
const EVIDENCE_FIELDS = [
  "id",
  "kind",
  "status",
  "description",
  "path",
  "revision",
  "command",
  "checkedAt",
  "url",
];
const CLAIM_FIELDS = ["text", "evidenceIds"];
const X_FIELDS = [
  "path",
  "intendedAccount",
  "destination",
  "options",
  "blockers",
];
const REDDIT_FIELDS = [
  "path",
  "intendedCommunity",
  "rulesCheckedAt",
  "blockers",
];
const AI_FIELDS = ["used", "disclosure", "humanReviewRequired"];
const EVIDENCE_KINDS = new Set([
  "source",
  "test",
  "commit",
  "remote-ci",
  "release",
  "deployment",
  "adoption",
]);
const EVIDENCE_STATUSES = new Set([
  "verified",
  "passed",
  "failed",
  "not-run",
  "unknown",
]);
const { parseTweet } = twitterText;

function fail(message, details, code = "INVALID_MANIFEST") {
  throw new MarketingError(code, message, details);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function strictKeys(value, allowed, label) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length)
    fail(`${label} contains unsupported fields.`, { fields: unexpected });
}

function string(value, label, { allowEmpty = false, max = 2_000 } = {}) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length === 0) ||
    value.length > max
  )
    fail(`${label} must be a valid string.`);
  return value;
}

function stringArray(value, label) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item || item.length > 500)
  )
    fail(`${label} must be an array of strings.`);
  return value;
}

function isoTimestamp(value, label, nullable = false) {
  if (nullable && value === null) return null;
  string(value, label, { max: 64 });
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    fail(`${label} must be an ISO-8601 UTC timestamp.`);
  return value;
}

function relativePath(value, label) {
  string(value, label, { max: 300 });
  if (path.isAbsolute(value) || value.includes("\\") || value.includes("\0"))
    fail(`${label} is unsafe.`, { path: value }, "UNSAFE_PATH");
  const normalized = path.posix.normalize(value);
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized !== value
  )
    fail(
      `${label} must be a normalized relative path.`,
      { path: value },
      "UNSAFE_PATH",
    );
  return value;
}

async function assertNoSymlink(boundary, target) {
  const boundaryPath = path.resolve(boundary);
  const targetPath = path.resolve(target);
  const relative = path.relative(boundaryPath, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    fail(
      "Referenced path escapes its allowed root.",
      { path: targetPath },
      "UNSAFE_PATH",
    );
  let current = boundaryPath;
  const rootStat = await lstat(current).catch(() => null);
  if (!rootStat || rootStat.isSymbolicLink())
    fail(
      "Allowed root is missing or is a symbolic link.",
      { path: boundaryPath },
      "UNSAFE_PATH",
    );
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await lstat(current).catch(() => null);
    if (!stat)
      fail(
        "Referenced path does not exist.",
        { path: current },
        "INVALID_BUNDLE",
      );
    if (stat.isSymbolicLink())
      fail(
        "Symbolic links are not accepted in marketing bundles or evidence paths.",
        { path: current },
        "UNSAFE_PATH",
      );
  }
  const resolvedBoundary = await realpath(boundaryPath);
  const resolvedTarget = await realpath(targetPath);
  const resolvedRelative = path.relative(resolvedBoundary, resolvedTarget);
  if (resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative))
    fail(
      "Referenced path resolves outside its allowed root.",
      { path: targetPath },
      "UNSAFE_PATH",
    );
  return targetPath;
}

async function boundedRead(boundary, relative, maximum) {
  relativePath(relative, "Referenced file path");
  const target = await assertNoSymlink(
    boundary,
    path.resolve(boundary, relative),
  );
  const stat = await lstat(target);
  if (!stat.isFile())
    fail(
      "Referenced path must be a regular file.",
      { path: relative },
      "INVALID_BUNDLE",
    );
  if (stat.size > maximum)
    fail(
      "Referenced file exceeds the size limit.",
      { path: relative, bytes: stat.size, maximum },
      "INVALID_BUNDLE",
    );
  return readFile(target, "utf8");
}

function validateManifestShape(manifest) {
  strictKeys(manifest, ROOT_FIELDS, "Manifest");
  if (manifest.version !== 1) fail("Only manifest version 1 is supported.");
  string(manifest.updateId, "updateId", { max: 100 });
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.updateId))
    fail("updateId must use lowercase letters, numbers, and hyphens.");
  isoTimestamp(manifest.timestamp, "timestamp");
  if (!new Set(["draft", "ready"]).has(manifest.editorialState))
    fail("editorialState must be draft or ready.");
  string(manifest.sourceRevision, "sourceRevision", { max: 100 });
  if (
    !Array.isArray(manifest.evidence) ||
    manifest.evidence.length === 0 ||
    manifest.evidence.length > 200
  )
    fail("evidence must contain 1-200 entries.");
  const evidenceIds = new Set();
  for (const [index, evidence] of manifest.evidence.entries()) {
    const label = `evidence[${index}]`;
    strictKeys(evidence, EVIDENCE_FIELDS, label);
    string(evidence.id, `${label}.id`, { max: 100 });
    if (
      !/^[a-z0-9][a-z0-9-]*$/.test(evidence.id) ||
      evidenceIds.has(evidence.id)
    )
      fail(`${label}.id must be unique and lowercase kebab-case.`);
    evidenceIds.add(evidence.id);
    if (!EVIDENCE_KINDS.has(evidence.kind))
      fail(`${label}.kind is unsupported.`);
    if (!EVIDENCE_STATUSES.has(evidence.status))
      fail(`${label}.status is unsupported.`);
    string(evidence.description, `${label}.description`, { max: 1_000 });
    if (evidence.path !== undefined)
      relativePath(evidence.path, `${label}.path`);
    if (evidence.revision !== undefined)
      string(evidence.revision, `${label}.revision`, { max: 100 });
    if (evidence.command !== undefined)
      string(evidence.command, `${label}.command`, { max: 500 });
    if (evidence.checkedAt !== undefined)
      isoTimestamp(evidence.checkedAt, `${label}.checkedAt`);
    if (evidence.url !== undefined) {
      string(evidence.url, `${label}.url`, { max: 500 });
      let url;
      try {
        url = new URL(evidence.url);
      } catch {
        fail(`${label}.url must be a valid URL.`);
      }
      if (url.protocol !== "https:") fail(`${label}.url must use HTTPS.`);
    }
    if (
      evidence.kind === "source" &&
      evidence.status === "verified" &&
      (!evidence.path || !evidence.revision)
    )
      fail(`${label} verified source evidence requires path and revision.`);
    if (
      evidence.kind === "commit" &&
      evidence.status === "verified" &&
      !evidence.revision
    )
      fail(`${label} verified commit evidence requires revision.`);
    if (
      evidence.kind === "test" &&
      evidence.status === "passed" &&
      (!evidence.command || !evidence.checkedAt)
    )
      fail(`${label} passed test evidence requires command and checkedAt.`);
  }
  if (
    !Array.isArray(manifest.claims) ||
    manifest.claims.length === 0 ||
    manifest.claims.length > 100
  )
    fail("claims must contain 1-100 entries.");
  for (const [index, claim] of manifest.claims.entries()) {
    const label = `claims[${index}]`;
    strictKeys(claim, CLAIM_FIELDS, label);
    string(claim.text, `${label}.text`, { max: 2_000 });
    if (!Array.isArray(claim.evidenceIds) || claim.evidenceIds.length === 0)
      fail(`${label}.evidenceIds must not be empty.`);
    for (const id of claim.evidenceIds)
      if (typeof id !== "string" || !evidenceIds.has(id))
        fail(`${label} references unknown evidence.`, { evidenceId: id });
  }
  strictKeys(manifest.channels, ["x", "reddit"], "channels");
  strictKeys(manifest.channels.x, X_FIELDS, "channels.x");
  relativePath(manifest.channels.x.path, "channels.x.path");
  string(manifest.channels.x.intendedAccount, "channels.x.intendedAccount", {
    max: 100,
  });
  if (
    manifest.channels.x.intendedAccount !== "unconfigured" &&
    !/^@?[A-Za-z0-9_]{1,15}$/.test(manifest.channels.x.intendedAccount)
  )
    fail(
      "channels.x.intendedAccount must be a valid X handle or unconfigured.",
    );
  if (manifest.channels.x.destination !== "timeline")
    fail("channels.x.destination must be timeline for the MVP.");
  strictKeys(manifest.channels.x.options, [], "channels.x.options");
  stringArray(manifest.channels.x.blockers, "channels.x.blockers");
  strictKeys(manifest.channels.reddit, REDDIT_FIELDS, "channels.reddit");
  relativePath(manifest.channels.reddit.path, "channels.reddit.path");
  string(
    manifest.channels.reddit.intendedCommunity,
    "channels.reddit.intendedCommunity",
    { max: 100 },
  );
  isoTimestamp(
    manifest.channels.reddit.rulesCheckedAt,
    "channels.reddit.rulesCheckedAt",
    true,
  );
  stringArray(manifest.channels.reddit.blockers, "channels.reddit.blockers");
  strictKeys(manifest.aiAssistance, AI_FIELDS, "aiAssistance");
  if (
    manifest.aiAssistance.used !== true ||
    manifest.aiAssistance.humanReviewRequired !== true
  )
    fail("AI assistance and human review must be explicitly disclosed.");
  string(manifest.aiAssistance.disclosure, "aiAssistance.disclosure", {
    max: 500,
  });
  stringArray(manifest.blockers, "blockers");
  return manifest;
}

export function normalizeXText(raw) {
  if (typeof raw !== "string")
    fail("X payload must be text.", undefined, "INVALID_BUNDLE");
  const normalized = raw
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .normalize("NFC")
    .replace(/\n$/, "");
  if (
    !normalized ||
    normalized.includes("\0") ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  )
    fail(
      "X payload is empty or contains unsupported control characters.",
      undefined,
      "INVALID_BUNDLE",
    );
  return normalized;
}

export function xTextMetrics(text) {
  const parsed = parseTweet(text);
  return {
    weightedLength: parsed.weightedLength,
    valid: parsed.valid,
    maxWeightedLength: 280,
  };
}

function canonicalAccount(account) {
  return account.replace(/^@/, "").toLowerCase();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function payloadFingerprint({
  updateId,
  sourceRevision,
  channel,
  intendedAccount,
  destination,
  options,
  text,
}) {
  const approval = {
    version: 1,
    updateId,
    sourceRevision,
    channel,
    intendedAccount: canonicalAccount(intendedAccount),
    destination,
    options,
    text,
  };
  return createHash("sha256")
    .update(stableJson(approval), "utf8")
    .digest("hex");
}

async function resolveCommit(revision, repoRoot, evidenceId) {
  try {
    const { stdout } = await execFile(
      "git",
      ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`],
      { cwd: repoRoot, timeout: 10_000, maxBuffer: 64 * 1024 },
    );
    const resolved = stdout.trim();
    if (revision !== resolved)
      fail(
        "Evidence revisions must be immutable full Git commit IDs.",
        { evidenceId, revision, resolvedRevision: resolved },
        "INVALID_BUNDLE",
      );
    return resolved;
  } catch (error) {
    if (error instanceof MarketingError) throw error;
    fail(
      "Evidence revision does not resolve to a Git commit.",
      { evidenceId, revision },
      "INVALID_BUNDLE",
    );
  }
}

async function verifyEvidence(manifest, repoRoot) {
  const sourceCommit = await resolveCommit(
    manifest.sourceRevision,
    repoRoot,
    "manifest.sourceRevision",
  );
  for (const evidence of manifest.evidence) {
    const evidenceCommit = evidence.revision
      ? await resolveCommit(evidence.revision, repoRoot, evidence.id)
      : undefined;
    if (
      evidence.kind === "source" &&
      evidence.status === "verified" &&
      evidenceCommit !== sourceCommit
    )
      fail(
        "Verified source evidence must reference the manifest source commit.",
        {
          evidenceId: evidence.id,
          revision: evidence.revision,
          sourceRevision: manifest.sourceRevision,
        },
        "INVALID_BUNDLE",
      );
    if (!evidence.path) continue;
    await assertNoSymlink(repoRoot, path.resolve(repoRoot, evidence.path));
    if (evidenceCommit) {
      try {
        await execFile(
          "git",
          ["cat-file", "-e", `${evidenceCommit}:${evidence.path}`],
          { cwd: repoRoot, timeout: 10_000, maxBuffer: 64 * 1024 },
        );
      } catch {
        fail(
          "Evidence path is not present at its referenced revision.",
          {
            evidenceId: evidence.id,
            path: evidence.path,
            revision: evidence.revision,
          },
          "INVALID_BUNDLE",
        );
      }
    }
  }
}

export async function loadBundle(
  bundleInput,
  { repoRoot = process.cwd(), verifyEvidencePaths = true } = {},
) {
  const bundleRoot = path.resolve(bundleInput);
  await assertNoSymlink(bundleRoot, bundleRoot);
  const manifestRaw = await boundedRead(
    bundleRoot,
    "manifest.json",
    MAX_MANIFEST_BYTES,
  );
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    fail("manifest.json is not valid JSON.");
  }
  validateManifestShape(manifest);
  const narrative = await boundedRead(
    bundleRoot,
    "update.md",
    MAX_NARRATIVE_BYTES,
  );
  const xRaw = await boundedRead(
    bundleRoot,
    manifest.channels.x.path,
    MAX_CHANNEL_BYTES,
  );
  const reddit = await boundedRead(
    bundleRoot,
    manifest.channels.reddit.path,
    MAX_CHANNEL_BYTES,
  );
  if (!/^# .+\n[\s\S]*\nAffiliation:/m.test(reddit))
    fail(
      "Reddit payload must contain a title and affiliation disclosure.",
      undefined,
      "INVALID_BUNDLE",
    );
  const xText = normalizeXText(xRaw);
  const metrics = xTextMetrics(xText);
  if (!metrics.valid || metrics.weightedLength > metrics.maxWeightedLength)
    fail(
      "X payload exceeds the weighted character limit.",
      metrics,
      "CONTENT_TOO_LONG",
    );
  if (verifyEvidencePaths)
    await verifyEvidence(manifest, path.resolve(repoRoot));
  const fingerprint = payloadFingerprint({
    updateId: manifest.updateId,
    sourceRevision: manifest.sourceRevision,
    channel: "x",
    intendedAccount: manifest.channels.x.intendedAccount,
    destination: manifest.channels.x.destination,
    options: manifest.channels.x.options,
    text: xText,
  });
  return Object.freeze({
    bundleRoot,
    manifest: Object.freeze(manifest),
    narrative,
    xText,
    reddit,
    xMetrics: Object.freeze(metrics),
    xFingerprint: fingerprint,
  });
}

export function assertLiveReady(bundle) {
  const blockers = [
    ...bundle.manifest.blockers,
    ...bundle.manifest.channels.x.blockers,
  ];
  if (bundle.manifest.editorialState !== "ready" || blockers.length)
    throw new MarketingError(
      "POLICY_NOT_CONFIRMED",
      "Bundle is not ready for publication.",
      { editorialState: bundle.manifest.editorialState, blockers },
    );
  if (
    canonicalAccount(bundle.manifest.channels.x.intendedAccount) ===
    "unconfigured"
  )
    throw new MarketingError(
      "POLICY_NOT_CONFIRMED",
      "The intended X account is not configured.",
    );
}

export async function discoverBundles(input) {
  const root = path.resolve(input);
  await assertNoSymlink(root, root);
  const directManifest = await lstat(path.join(root, "manifest.json")).catch(
    () => null,
  );
  if (directManifest) return [root];
  const entries = await readdir(root, { withFileTypes: true });
  const bundles = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = path.join(root, entry.name);
    const manifest = await lstat(path.join(candidate, "manifest.json")).catch(
      () => null,
    );
    if (manifest?.isFile() && !manifest.isSymbolicLink())
      bundles.push(candidate);
  }
  if (!bundles.length)
    fail("No marketing bundles were found.", { path: input }, "INVALID_BUNDLE");
  return bundles;
}

export function previewResult(bundle, channel) {
  if (channel === "x")
    return {
      ok: true,
      operation: "preview",
      channel: "x",
      updateId: bundle.manifest.updateId,
      sourceRevision: bundle.manifest.sourceRevision,
      editorialState: bundle.manifest.editorialState,
      intendedAccount: bundle.manifest.channels.x.intendedAccount,
      destination: bundle.manifest.channels.x.destination,
      options: bundle.manifest.channels.x.options,
      text: bundle.xText,
      weightedLength: bundle.xMetrics.weightedLength,
      maxWeightedLength: bundle.xMetrics.maxWeightedLength,
      fingerprint: bundle.xFingerprint,
      blockers: [
        ...bundle.manifest.blockers,
        ...bundle.manifest.channels.x.blockers,
      ],
    };
  if (channel === "reddit")
    return {
      ok: true,
      operation: "preview",
      channel: "reddit",
      updateId: bundle.manifest.updateId,
      editorialState: bundle.manifest.editorialState,
      intendedCommunity: bundle.manifest.channels.reddit.intendedCommunity,
      rulesCheckedAt: bundle.manifest.channels.reddit.rulesCheckedAt,
      text: bundle.reddit,
      blockers: [
        ...bundle.manifest.blockers,
        ...bundle.manifest.channels.reddit.blockers,
      ],
    };
  throw new MarketingError("INVALID_COMMAND", "Channel must be x or reddit.");
}
