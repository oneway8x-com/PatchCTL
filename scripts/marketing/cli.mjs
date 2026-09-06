#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stderr, stdout } from "node:process";
import path from "node:path";
import { collectEvidence } from "./collect.mjs";
import { discoverBundles, loadBundle, previewResult } from "./bundle.mjs";
import { asMarketingError, errorResult, MarketingError } from "./errors.mjs";
import {
  assertApprovedXPayload,
  publicationStatus,
  publishLive,
  reconcilePublication,
} from "./publisher.mjs";

const BOOLEAN_FLAGS = new Set([
  "json",
  "dry-run",
  "live",
  "web-intent",
  "no-post",
  "repair-receipt",
]);

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    if (!name || Object.hasOwn(flags, name))
      throw new MarketingError(
        "INVALID_COMMAND",
        `Duplicate or empty flag: ${value}`,
      );
    if (BOOLEAN_FLAGS.has(name)) flags[name] = true;
    else {
      const next = rest[index + 1];
      if (next === undefined || next.startsWith("--"))
        throw new MarketingError(
          "INVALID_COMMAND",
          `${value} requires a value.`,
        );
      flags[name] = next;
      index += 1;
    }
  }
  return { command, positional, flags };
}

function requireShape(parsed, { positionals, flags }) {
  const unknown = Object.keys(parsed.flags).filter(
    (flag) => !flags.includes(flag),
  );
  if (unknown.length || parsed.positional.length !== positionals)
    throw new MarketingError(
      "INVALID_COMMAND",
      "Command arguments are invalid.",
      { unknownFlags: unknown, expectedPositionals: positionals },
    );
}

function writeJson(value, stream = stdout) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function humanPreview(result) {
  if (result.channel === "x") {
    return [
      `Update: ${result.updateId}`,
      `State: ${result.editorialState}`,
      `Account: ${result.intendedAccount}`,
      `Destination: ${result.destination}`,
      `Source revision: ${result.sourceRevision}`,
      `Weighted length: ${result.weightedLength}/${result.maxWeightedLength}`,
      `SHA-256 fingerprint: ${result.fingerprint}`,
      "--- exact normalized X payload ---",
      result.text,
      "--- end payload ---",
      ...(result.blockers.length
        ? ["Blockers:", ...result.blockers.map((item) => `- ${item}`)]
        : []),
    ].join("\n");
  }
  return [
    `Update: ${result.updateId}`,
    `State: ${result.editorialState}`,
    `Community: ${result.intendedCommunity}`,
    "--- exact Reddit export ---",
    result.text,
    "--- end export ---",
    ...(result.blockers.length
      ? ["Blockers:", ...result.blockers.map((item) => `- ${item}`)]
      : []),
  ].join("\n");
}

async function interactiveConfirmation({ bundle, identity, phrase }) {
  if (!stdin.isTTY || !stderr.isTTY) return false;
  stderr.write(`${humanPreview(previewResult(bundle, "x"))}\n`);
  if (identity)
    stderr.write(
      `Authenticated account: @${identity.username} (${identity.id})\n`,
    );
  stderr.write(`Type exactly: ${phrase}\n`);
  const reader = createInterface({ input: stdin, output: stderr });
  try {
    return (await reader.question("> ")).trim() === phrase;
  } finally {
    reader.close();
  }
}

export function buildXWebIntentUrl(text) {
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", text);
  return url.toString();
}

async function run(parsed) {
  const json = parsed.flags.json === true;
  if (parsed.command === "collect") {
    requireShape(parsed, { positionals: 0, flags: ["since", "json"] });
    if (!parsed.flags.since)
      throw new MarketingError(
        "INVALID_COMMAND",
        "collect requires --since <git-ref>.",
      );
    return collectEvidence(parsed.flags.since);
  }
  if (parsed.command === "validate") {
    requireShape(parsed, { positionals: 1, flags: ["json"] });
    const bundlePaths = await discoverBundles(parsed.positional[0]);
    const bundles = [];
    for (const bundlePath of bundlePaths) {
      const bundle = await loadBundle(bundlePath);
      bundles.push({
        updateId: bundle.manifest.updateId,
        path: path.relative(process.cwd(), bundle.bundleRoot) || ".",
        editorialState: bundle.manifest.editorialState,
        xWeightedLength: bundle.xMetrics.weightedLength,
        xFingerprint: bundle.xFingerprint,
        blockers:
          bundle.manifest.blockers.length +
          bundle.manifest.channels.x.blockers.length +
          bundle.manifest.channels.reddit.blockers.length,
      });
    }
    return { ok: true, operation: "validate", bundles };
  }
  if (parsed.command === "preview") {
    requireShape(parsed, { positionals: 1, flags: ["channel", "json"] });
    const bundle = await loadBundle(parsed.positional[0]);
    return previewResult(bundle, parsed.flags.channel);
  }
  if (parsed.command === "export") {
    requireShape(parsed, { positionals: 1, flags: ["channel", "json"] });
    if (parsed.flags.channel !== "reddit")
      throw new MarketingError(
        "INVALID_COMMAND",
        "MVP export supports --channel reddit; use preview for X.",
      );
    const bundle = await loadBundle(parsed.positional[0]);
    const result = previewResult(bundle, "reddit");
    return { ...result, operation: "export", rawExport: !json };
  }
  if (parsed.command === "publish") {
    requireShape(parsed, {
      positionals: 1,
      flags: [
        "channel",
        "dry-run",
        "live",
        "web-intent",
        "expected-hash",
        "json",
      ],
    });
    if (parsed.flags.channel === "reddit")
      throw new MarketingError(
        "CHANNEL_MANUAL_ONLY",
        "Reddit publishing is manual-only. Use export and post manually after checking community rules.",
      );
    if (parsed.flags.channel !== "x")
      throw new MarketingError(
        "INVALID_COMMAND",
        "publish requires --channel x.",
      );
    const selectedModes = [
      parsed.flags["dry-run"],
      parsed.flags.live,
      parsed.flags["web-intent"],
    ].filter(Boolean).length;
    if (selectedModes !== 1)
      throw new MarketingError(
        "INVALID_COMMAND",
        "Choose exactly one of --dry-run, --live, or --web-intent.",
      );
    const bundle = await loadBundle(parsed.positional[0]);
    if (parsed.flags["dry-run"])
      return {
        ...previewResult(bundle, "x"),
        operation: "publish",
        dryRun: true,
        networkUsed: false,
        journalWritten: false,
      };
    if (parsed.flags["web-intent"]) {
      assertApprovedXPayload(bundle, parsed.flags["expected-hash"]);
      return {
        ok: true,
        operation: "publish",
        channel: "x",
        mode: "web-intent",
        updateId: bundle.manifest.updateId,
        intendedAccount: bundle.manifest.channels.x.intendedAccount,
        fingerprint: bundle.xFingerprint,
        intentUrl: buildXWebIntentUrl(bundle.xText),
        apiUsed: false,
        journalWritten: false,
        publicationConfirmed: false,
      };
    }
    return publishLive(bundle, parsed.flags["expected-hash"], {
      confirm: interactiveConfirmation,
    });
  }
  if (parsed.command === "status") {
    requireShape(parsed, { positionals: 1, flags: ["json"] });
    return publicationStatus(await loadBundle(parsed.positional[0]));
  }
  if (parsed.command === "reconcile") {
    requireShape(parsed, {
      positionals: 1,
      flags: [
        "channel",
        "remote-id",
        "remote-url",
        "published-at",
        "no-post",
        "repair-receipt",
        "reason",
        "json",
      ],
    });
    if (parsed.flags.channel !== "x")
      throw new MarketingError(
        "CHANNEL_MANUAL_ONLY",
        "Only X has a publication journal in the MVP.",
      );
    const hasRemote = Boolean(
      parsed.flags["remote-id"] ||
      parsed.flags["remote-url"] ||
      parsed.flags["published-at"],
    );
    const reconciliationModes = [
      hasRemote,
      Boolean(parsed.flags["no-post"]),
      Boolean(parsed.flags["repair-receipt"]),
    ].filter(Boolean).length;
    if (reconciliationModes !== 1)
      throw new MarketingError(
        "INVALID_COMMAND",
        "Reconcile with exactly one of --remote-id/--remote-url/--published-at, --no-post --reason, or --repair-receipt.",
      );
    if (
      (hasRemote &&
        (!parsed.flags["remote-id"] ||
          !parsed.flags["remote-url"] ||
          !parsed.flags["published-at"])) ||
      (parsed.flags["no-post"] && !parsed.flags.reason) ||
      (!parsed.flags["no-post"] && parsed.flags.reason)
    )
      throw new MarketingError(
        "INVALID_COMMAND",
        "Reconciliation flags are incomplete or conflict with the selected outcome.",
      );
    const bundle = await loadBundle(parsed.positional[0]);
    return reconcilePublication(
      bundle,
      {
        noPost: parsed.flags["no-post"],
        repairReceipt: parsed.flags["repair-receipt"],
        reason: parsed.flags.reason,
        remoteId: parsed.flags["remote-id"],
        remoteUrl: parsed.flags["remote-url"],
        publishedAt: parsed.flags["published-at"],
      },
      { confirm: interactiveConfirmation },
    );
  }
  throw new MarketingError(
    "INVALID_COMMAND",
    "Unknown marketing command. Use collect, validate, preview, export, publish, status, or reconcile.",
  );
}

export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArguments(argv);
    const result = await run(parsed);
    if (result.rawExport)
      stdout.write(
        result.text.endsWith("\n") ? result.text : `${result.text}\n`,
      );
    else if (parsed.flags.json) writeJson(result);
    else if (result.operation === "preview" || result.dryRun)
      stdout.write(
        `${humanPreview(result)}\n${result.dryRun ? "Dry-run only: no network or journal write occurred.\n" : ""}`,
      );
    else if (result.operation === "validate")
      stdout.write(`Validated ${result.bundles.length} marketing bundle(s).\n`);
    else if (result.mode === "web-intent")
      stdout.write(
        [
          `Open this link to compose the reviewed text on X as @${result.intendedAccount.replace(/^@/, "")}:`,
          result.intentUrl,
          "",
          "No API request was made. Check the signed-in X account and text, then click Post in the browser.",
          "Opening the link is not proof of publication, so no journal entry or receipt was created.",
          "",
        ].join("\n"),
      );
    else writeJson(result);
    return 0;
  } catch (error) {
    const known = asMarketingError(error);
    writeJson(errorResult(known), stderr);
    return known.exitCode;
  }
}

if (import.meta.url === `file://${process.argv[1]}`)
  process.exitCode = await main();
