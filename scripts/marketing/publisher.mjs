import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { assertLiveReady } from "./bundle.mjs";
import { MarketingError, sanitizeDiagnostic } from "./errors.mjs";
import {
  assertSecureStateRoot,
  atomicWriteJson,
  assertNoBlockingAttempt,
  newAttempt,
  publicationIdentity,
  readJournal,
  stateRoot,
  transitionAttempt,
  withJournalLock,
  writePublicReceipt,
} from "./journal.mjs";
import { XurlTransport, XURL_VERSION } from "./xurl.mjs";

const POLICY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const POLICY_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export async function readPolicyConfirmation(
  root,
  { now = () => new Date() } = {},
) {
  await assertSecureStateRoot(root);
  const file = path.join(root, "publisher-policy.json");
  let value;
  try {
    const stat = await lstat(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
    )
      throw new Error("unsafe policy file");
    value = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new MarketingError(
      "POLICY_NOT_CONFIRMED",
      "Publisher policy confirmation is missing or invalid.",
      { expectedPath: file },
    );
  }
  const allowed = [
    "version",
    "project",
    "xurlVersion",
    "platformPolicyConfirmedAt",
    "useCase",
  ];
  const confirmedAt = Date.parse(value?.platformPolicyConfirmedAt);
  const age = now().getTime() - confirmedAt;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    value.version !== 1 ||
    value.project !== "PatchCTL" ||
    value.xurlVersion !== XURL_VERSION ||
    value.useCase !== "human-approved-standalone-ai-assisted-text" ||
    !UTC_TIMESTAMP.test(value.platformPolicyConfirmedAt ?? "") ||
    Number.isNaN(confirmedAt) ||
    age > POLICY_MAX_AGE_MS ||
    age < -POLICY_FUTURE_SKEW_MS
  ) {
    throw new MarketingError(
      "POLICY_NOT_CONFIRMED",
      "Publisher policy confirmation does not match the reviewed MVP use case.",
      { expectedPath: file },
    );
  }
  return value;
}

export async function publishLive(
  bundle,
  expectedHash,
  {
    root = stateRoot(),
    transport = new XurlTransport(),
    confirm,
    now = () => new Date(),
    journalFailurePoint,
    receiptFailurePoint,
  } = {},
) {
  assertLiveReady(bundle);
  if (
    !/^[a-f0-9]{64}$/.test(expectedHash ?? "") ||
    expectedHash !== bundle.xFingerprint
  )
    throw new MarketingError(
      "CONTENT_CHANGED",
      "Expected fingerprint does not match the normalized approved payload.",
      { expected: expectedHash, actual: bundle.xFingerprint },
    );
  await readPolicyConfirmation(root, { now });
  await transport.verifyVersion();
  const identity = await transport.identity(
    bundle.manifest.channels.x.intendedAccount,
  );
  if (
    identity.username.toLowerCase() !==
    bundle.manifest.channels.x.intendedAccount.replace(/^@/, "").toLowerCase()
  )
    throw new MarketingError(
      "ACCOUNT_MISMATCH",
      "Authenticated X account does not match the approved destination.",
      {
        approved: bundle.manifest.channels.x.intendedAccount,
        authenticated: `@${identity.username}`,
      },
    );
  if (
    typeof confirm !== "function" ||
    !(await confirm({
      bundle,
      identity,
      phrase: `PUBLISH ${bundle.xFingerprint.slice(0, 12)}`,
    }))
  )
    throw new MarketingError(
      "POLICY_NOT_CONFIRMED",
      "Live publication requires explicit confirmation in an interactive isolated publisher terminal.",
    );

  const immutableSnapshot = Object.freeze({
    text: bundle.xText,
    fingerprint: bundle.xFingerprint,
    account: bundle.manifest.channels.x.intendedAccount,
  });
  const journalIdentity = publicationIdentity(bundle);
  return withJournalLock(root, journalIdentity, async ({ file, journal }) => {
    await readPolicyConfirmation(root, { now });
    assertNoBlockingAttempt(journal);
    const attempt = newAttempt(bundle, now());
    journal.attempts.push(attempt);
    await atomicWriteJson(file, journal, {
      failurePoint:
        journalFailurePoint === "before-send" ? "before-rename" : undefined,
    });
    let posted;
    try {
      posted = await transport.post(
        immutableSnapshot.text,
        immutableSnapshot.account,
      );
      if (!/^\d{1,30}$/.test(String(posted?.id ?? "")))
        throw new MarketingError(
          "PUBLISH_OUTCOME_UNKNOWN",
          "X returned a malformed success response. Reconcile before any retry.",
        );
    } catch (error) {
      if (
        error instanceof MarketingError &&
        error.code === "DEFINITIVE_API_ERROR"
      ) {
        transitionAttempt(attempt, "rejected", {
          now: now(),
          error: {
            code: error.code,
            message: sanitizeDiagnostic(error.details?.reason ?? error.message),
          },
          reason: "Transport returned a definitive API rejection.",
        });
        await atomicWriteJson(file, journal);
        throw error;
      }
      transitionAttempt(attempt, "unknown", {
        now: now(),
        error: {
          code: "PUBLISH_OUTCOME_UNKNOWN",
          message: sanitizeDiagnostic(error.message),
        },
        reason: "Transport outcome was ambiguous.",
      });
      await atomicWriteJson(file, journal).catch(() => {});
      throw error instanceof MarketingError
        ? error
        : new MarketingError(
            "PUBLISH_OUTCOME_UNKNOWN",
            "Publication outcome is unknown. Reconcile before any retry.",
          );
    }
    const publishedAt = now().toISOString();
    const remote = {
      id: posted.id,
      url: `https://x.com/${identity.username}/status/${posted.id}`,
      publishedAt,
    };
    transitionAttempt(attempt, "published", {
      now: now(),
      remote,
      reason: "X returned a confirmed post ID.",
    });
    try {
      await atomicWriteJson(file, journal, {
        failurePoint:
          journalFailurePoint === "after-send" ? "before-rename" : undefined,
      });
    } catch {
      throw new MarketingError(
        "PUBLISH_OUTCOME_UNKNOWN",
        "X confirmed a post but the authoritative journal could not persist the receipt. Reconcile before any retry.",
        { attemptId: attempt.id, publicPostId: posted.id },
      );
    }
    let receiptPath;
    try {
      receiptPath = await writePublicReceipt(bundle, remote, {
        failurePoint: receiptFailurePoint,
      });
    } catch {
      throw new MarketingError(
        "RECEIPT_WRITE_FAILED",
        "Publication is confirmed in the authoritative journal, but the sanitized public receipt could not be written.",
        { attemptId: attempt.id, publicPostId: posted.id, journalPath: file },
      );
    }
    return {
      ok: true,
      operation: "publish",
      channel: "x",
      updateId: bundle.manifest.updateId,
      fingerprint: immutableSnapshot.fingerprint,
      publicPostId: posted.id,
      publicUrl: remote.url,
      publishedAt,
      journalPath: file,
      receiptPath,
    };
  });
}

export async function publicationStatus(bundle, { root = stateRoot() } = {}) {
  const identity = publicationIdentity(bundle);
  const { file, journal } = await readJournal(root, identity);
  return {
    ok: true,
    operation: "status",
    identity,
    fingerprint: bundle.xFingerprint,
    journalPath: file,
    attempts: journal.attempts,
  };
}

function validateRemote(remoteId, remoteUrl, publishedAt, account) {
  if (!/^\d{1,30}$/.test(remoteId ?? ""))
    throw new MarketingError(
      "INVALID_COMMAND",
      "--remote-id must contain only digits.",
    );
  let url;
  try {
    url = new URL(remoteUrl);
  } catch {
    throw new MarketingError(
      "INVALID_COMMAND",
      "--remote-url must be a valid X post URL.",
    );
  }
  const expected = new RegExp(
    `^/${account.replace(/^@/, "")}/status/${remoteId}$`,
    "i",
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "x.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !expected.test(url.pathname)
  )
    throw new MarketingError(
      "INVALID_COMMAND",
      "Remote URL does not match the approved account and post ID.",
    );
  if (Number.isNaN(Date.parse(publishedAt)))
    throw new MarketingError(
      "INVALID_COMMAND",
      "--published-at must be an ISO timestamp.",
    );
  return {
    id: remoteId,
    url: url.toString(),
    publishedAt: new Date(publishedAt).toISOString(),
  };
}

function assertAttemptMatchesBundle(attempt, bundle) {
  if (
    attempt.fingerprint !== bundle.xFingerprint ||
    attempt.sourceRevision !== bundle.manifest.sourceRevision
  )
    throw new MarketingError(
      "CONTENT_CHANGED",
      "The current bundle does not match the publication attempt being reconciled.",
      {
        attemptFingerprint: attempt.fingerprint,
        currentFingerprint: bundle.xFingerprint,
        attemptSourceRevision: attempt.sourceRevision,
        currentSourceRevision: bundle.manifest.sourceRevision,
      },
    );
}

export async function reconcilePublication(
  bundle,
  options,
  {
    root = stateRoot(),
    confirm,
    now = () => new Date(),
    receiptFailurePoint,
  } = {},
) {
  if (
    typeof confirm !== "function" ||
    !(await confirm({
      bundle,
      phrase: options.repairReceipt
        ? `REPAIR RECEIPT ${bundle.manifest.updateId}`
        : options.noPost
          ? `NO POST ${bundle.manifest.updateId}`
          : `RECORD ${options.remoteId}`,
    }))
  )
    throw new MarketingError(
      "POLICY_NOT_CONFIRMED",
      "Reconciliation requires explicit operator confirmation in an interactive terminal.",
    );
  const identity = publicationIdentity(bundle);
  return withJournalLock(root, identity, async ({ file, journal }) => {
    if (options.repairReceipt) {
      const attempt = [...journal.attempts]
        .reverse()
        .find((item) => item.status === "published");
      if (!attempt?.remote)
        throw new MarketingError(
          "INVALID_COMMAND",
          "No published attempt is available for receipt repair.",
        );
      assertAttemptMatchesBundle(attempt, bundle);
      let receiptPath;
      try {
        receiptPath = await writePublicReceipt(bundle, attempt.remote, {
          failurePoint: receiptFailurePoint,
        });
      } catch (error) {
        if (error instanceof MarketingError) throw error;
        throw new MarketingError(
          "RECEIPT_WRITE_FAILED",
          "The authoritative journal is published, but the public receipt could not be repaired.",
          { attemptId: attempt.id, journalPath: file },
        );
      }
      return {
        ok: true,
        operation: "reconcile",
        outcome: "receipt-repaired",
        attemptId: attempt.id,
        publicPostId: attempt.remote.id,
        publicUrl: attempt.remote.url,
        journalPath: file,
        receiptPath,
      };
    }
    const attempt = [...journal.attempts]
      .reverse()
      .find((item) => new Set(["pending", "unknown"]).has(item.status));
    if (!attempt)
      throw new MarketingError(
        "INVALID_COMMAND",
        "No pending or unknown attempt is available for reconciliation.",
      );
    assertAttemptMatchesBundle(attempt, bundle);
    if (options.noPost) {
      if (!options.reason)
        throw new MarketingError(
          "INVALID_COMMAND",
          "A preserved operator reason is required when declaring that no post was created.",
        );
      transitionAttempt(attempt, "reconciled-no-post", {
        now: now(),
        error: null,
        reason: `Operator independently determined no post was created: ${sanitizeDiagnostic(options.reason)}`,
      });
      await atomicWriteJson(file, journal);
      return {
        ok: true,
        operation: "reconcile",
        outcome: "no-post",
        attemptId: attempt.id,
        journalPath: file,
      };
    }
    const remote = validateRemote(
      options.remoteId,
      options.remoteUrl,
      options.publishedAt,
      bundle.manifest.channels.x.intendedAccount,
    );
    transitionAttempt(attempt, "published", {
      now: now(),
      remote,
      reason:
        "Operator independently verified the remote post without reposting.",
    });
    await atomicWriteJson(file, journal);
    let receiptPath;
    try {
      receiptPath = await writePublicReceipt(bundle, remote, {
        failurePoint: receiptFailurePoint,
      });
    } catch {
      throw new MarketingError(
        "RECEIPT_WRITE_FAILED",
        "Reconciliation is confirmed in the authoritative journal, but the public receipt could not be written.",
        { attemptId: attempt.id, journalPath: file },
      );
    }
    return {
      ok: true,
      operation: "reconcile",
      outcome: "published",
      attemptId: attempt.id,
      publicPostId: remote.id,
      publicUrl: remote.url,
      journalPath: file,
      receiptPath,
    };
  });
}
