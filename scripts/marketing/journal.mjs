import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MarketingError } from "./errors.mjs";

export function stateRoot(
  env = process.env,
  platform = process.platform,
  home = os.homedir(),
) {
  if (env.PATCHCTL_MARKETING_HOME)
    return path.resolve(env.PATCHCTL_MARKETING_HOME);
  if (platform === "darwin")
    return path.join(
      home,
      "Library",
      "Application Support",
      "PatchCTL",
      "marketing-publisher",
    );
  if (platform === "win32")
    return path.join(
      env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
      "PatchCTL",
      "marketing-publisher",
    );
  return path.join(
    env.XDG_STATE_HOME || path.join(home, ".local", "state"),
    "patchctl",
    "marketing-publisher",
  );
}

export function publicationIdentity(bundle) {
  return Object.freeze({
    project: "PatchCTL",
    updateId: bundle.manifest.updateId,
    channel: "x",
    destinationAccount: bundle.manifest.channels.x.intendedAccount
      .replace(/^@/, "")
      .toLowerCase(),
  });
}

export function identityKey(identity) {
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

export function journalPath(root, identity) {
  return path.join(root, "journal", `${identityKey(identity)}.json`);
}

export async function assertSecureStateRoot(root) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new MarketingError(
      "PUBLISH_OUTCOME_UNKNOWN",
      "Publisher state root must be a real directory, not a symbolic link.",
      { stateRoot: root },
    );
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
    throw new MarketingError(
      "PUBLISH_OUTCOME_UNKNOWN",
      "Publisher state root must be accessible only to its owner (mode 700).",
      { stateRoot: root },
    );
}

export async function atomicWriteJson(target, value, { failurePoint } = {}) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (failurePoint === "before-rename")
      throw new Error("Injected persistence failure");
    await rename(temporary, target);
    const directory = await open(path.dirname(target), "r");
    try {
      await directory.sync();
    } catch (error) {
      if (!new Set(["EINVAL", "EISDIR", "ENOTSUP"]).has(error.code))
        throw error;
    } finally {
      await directory.close();
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}

export async function atomicCreateJson(target, value, { failurePoint } = {}) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (failurePoint === "before-rename")
      throw new Error("Injected persistence failure");
    await link(temporary, target);
    const directory = await open(path.dirname(target), "r");
    try {
      await directory.sync();
    } catch (error) {
      if (!new Set(["EINVAL", "EISDIR", "ENOTSUP"]).has(error.code))
        throw error;
    } finally {
      await directory.close();
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}

function validTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function validError(error, expectedCode) {
  return (
    exactKeys(error, ["code", "message"]) &&
    error.code === expectedCode &&
    typeof error.message === "string"
  );
}

function validRemote(remote, identity) {
  if (
    !exactKeys(remote, ["id", "url", "publishedAt"]) ||
    !/^\d{1,30}$/.test(String(remote.id)) ||
    typeof remote.url !== "string" ||
    !validTimestamp(remote.publishedAt)
  )
    return false;
  try {
    const url = new URL(remote.url);
    return (
      url.protocol === "https:" &&
      url.hostname === "x.com" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === "" &&
      url.pathname.toLowerCase() ===
        `/${identity.destinationAccount}/status/${remote.id}`.toLowerCase()
    );
  } catch {
    return false;
  }
}

function validAttempt(attempt, identity) {
  if (
    !exactKeys(attempt, [
      "id",
      "fingerprint",
      "sourceRevision",
      "status",
      "startedAt",
      "completedAt",
      "remote",
      "error",
      "history",
    ]) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      attempt.id ?? "",
    ) ||
    !/^[a-f0-9]{64}$/.test(attempt.fingerprint ?? "") ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(attempt.sourceRevision ?? "") ||
    !validTimestamp(attempt.startedAt) ||
    !Array.isArray(attempt.history) ||
    attempt.history.length === 0
  )
    return false;
  const history = attempt.history;
  if (
    history.some(
      (entry) =>
        !exactKeys(entry, ["status", "at", "reason"]) ||
        !validTimestamp(entry.at) ||
        typeof entry.reason !== "string",
    ) ||
    history[0].status !== "pending" ||
    history[0].at !== attempt.startedAt ||
    history.at(-1).status !== attempt.status
  )
    return false;
  const sequence = history.map((entry) => entry.status).join(",");
  const legalSequences = new Map([
    ["pending", new Set(["pending"])],
    ["unknown", new Set(["pending,unknown"])],
    ["rejected", new Set(["pending,rejected"])],
    [
      "reconciled-no-post",
      new Set([
        "pending,reconciled-no-post",
        "pending,unknown,reconciled-no-post",
      ]),
    ],
    ["published", new Set(["pending,published", "pending,unknown,published"])],
  ]);
  if (!legalSequences.get(attempt.status)?.has(sequence)) return false;
  if (attempt.status === "pending")
    return (
      attempt.completedAt === null &&
      attempt.remote === null &&
      attempt.error === null
    );
  if (
    !validTimestamp(attempt.completedAt) ||
    attempt.completedAt !== history.at(-1).at
  )
    return false;
  if (attempt.status === "published")
    return validRemote(attempt.remote, identity) && attempt.error === null;
  if (attempt.remote !== null) return false;
  if (attempt.status === "unknown")
    return validError(attempt.error, "PUBLISH_OUTCOME_UNKNOWN");
  if (attempt.status === "rejected")
    return validError(attempt.error, "DEFINITIVE_API_ERROR");
  return attempt.error === null;
}

export async function readJournal(root, identity) {
  await assertSecureStateRoot(root);
  const file = journalPath(root, identity);
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("unsafe journal file");
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (
      !exactKeys(parsed, ["version", "identity", "attempts"]) ||
      parsed.version !== 1 ||
      JSON.stringify(parsed.identity) !== JSON.stringify(identity) ||
      !Array.isArray(parsed.attempts) ||
      parsed.attempts.some((attempt) => !validAttempt(attempt, identity))
    )
      throw new Error("invalid journal");
    return { file, journal: parsed };
  } catch (error) {
    if (error.code === "ENOENT")
      return { file, journal: { version: 1, identity, attempts: [] } };
    throw new MarketingError(
      "PUBLISH_OUTCOME_UNKNOWN",
      "Publisher journal is unreadable; publication is blocked until the state is repaired from a trusted backup.",
      { journalPath: file },
    );
  }
}

export async function withJournalLock(root, identity, callback) {
  await assertSecureStateRoot(root);
  const file = journalPath(root, identity);
  const lock = `${file}.lock`;
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST")
      throw new MarketingError(
        "PUBLISH_IN_PROGRESS",
        "Another publisher process holds this publication lock. Do not remove it until the operator verifies no process or ambiguous attempt remains.",
        { lockPath: lock },
      );
    throw error;
  }
  try {
    return await callback({ file, ...(await readJournal(root, identity)) });
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export function assertNoBlockingAttempt(journal) {
  const safeTerminalStates = new Set(["rejected", "reconciled-no-post"]);
  const blocking = [...journal.attempts]
    .reverse()
    .find((attempt) => !safeTerminalStates.has(attempt.status));
  if (!blocking) return;
  if (blocking.status === "published")
    throw new MarketingError(
      "ALREADY_PUBLISHED",
      "This update is already recorded as published to the approved destination.",
      { attemptId: blocking.id, publicPostId: blocking.remote?.id },
    );
  throw new MarketingError(
    "PUBLISH_OUTCOME_UNKNOWN",
    "A prior publication attempt is pending or has an unknown outcome. Reconcile it without reposting.",
    { attemptId: blocking.id, status: blocking.status },
  );
}

export function newAttempt(bundle, now = new Date()) {
  return {
    id: randomUUID(),
    fingerprint: bundle.xFingerprint,
    sourceRevision: bundle.manifest.sourceRevision,
    status: "pending",
    startedAt: now.toISOString(),
    completedAt: null,
    remote: null,
    error: null,
    history: [
      {
        status: "pending",
        at: now.toISOString(),
        reason: "Attempt persisted before transport send.",
      },
    ],
  };
}

export function transitionAttempt(
  attempt,
  status,
  { now = new Date(), remote = null, error = null, reason },
) {
  attempt.status = status;
  attempt.completedAt = status === "pending" ? null : now.toISOString();
  attempt.remote = remote;
  attempt.error = error;
  attempt.history.push({ status, at: now.toISOString(), reason });
}

export function publicReceipt(bundle, remote) {
  return {
    version: 1,
    updateId: bundle.manifest.updateId,
    channel: "x",
    destinationAccount: bundle.manifest.channels.x.intendedAccount,
    publicPostId: remote.id,
    publicUrl: remote.url,
    publishedAt: remote.publishedAt,
    payloadFingerprint: bundle.xFingerprint,
    sourceRevision: bundle.manifest.sourceRevision,
  };
}

export async function writePublicReceipt(bundle, remote, options = {}) {
  const id = String(remote.id);
  if (!/^\d{1,30}$/.test(id))
    throw new MarketingError(
      "INVALID_COMMAND",
      "Remote post ID must contain only digits.",
    );
  const directory = path.join(bundle.bundleRoot, "publications");
  await mkdir(directory, { recursive: true, mode: 0o755 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new MarketingError(
      "RECEIPT_WRITE_FAILED",
      "Public receipt directory must be a real directory inside the bundle.",
    );
  const target = path.join(directory, `x-${id}.json`);
  const receipt = publicReceipt(bundle, remote);
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  try {
    await atomicCreateJson(target, receipt, options);
    return target;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  try {
    const existingStat = await lstat(target);
    if (!existingStat.isFile() || existingStat.isSymbolicLink())
      throw new Error("unsafe receipt");
    if ((await readFile(target, "utf8")) === serialized) return target;
    throw new Error("conflicting receipt");
  } catch {
    throw new MarketingError(
      "RECEIPT_WRITE_FAILED",
      "An existing public receipt is unsafe or conflicts with the authoritative journal.",
      { receiptPath: target },
    );
  }
}
