const EXIT_CODES = Object.freeze({
  INVALID_COMMAND: 2,
  INVALID_MANIFEST: 2,
  INVALID_BUNDLE: 2,
  UNSAFE_PATH: 2,
  CONTENT_TOO_LONG: 2,
  CONTENT_CHANGED: 3,
  POLICY_NOT_CONFIRMED: 3,
  CHANNEL_MANUAL_ONLY: 3,
  AUTH_NOT_CONFIGURED: 4,
  ACCOUNT_MISMATCH: 4,
  ALREADY_PUBLISHED: 5,
  PUBLISH_IN_PROGRESS: 5,
  PUBLISH_OUTCOME_UNKNOWN: 7,
  DEFINITIVE_API_ERROR: 6,
  RECEIPT_WRITE_FAILED: 6,
  INTERNAL_ERROR: 1,
});

export class MarketingError extends Error {
  constructor(code, message, details = undefined, cause = undefined) {
    super(message, cause ? { cause } : undefined);
    this.name = "MarketingError";
    this.code = code;
    this.details = details;
    this.exitCode = EXIT_CODES[code] ?? 1;
  }
}

export function sanitizeDiagnostic(value) {
  return String(value ?? "")
    .replaceAll(/\u001b\[[0-9;]*m/g, "")
    .replaceAll(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replaceAll(
      /\b(authorization|bearer|token|secret|password|client[_-]?secret)\b\s*[:=]\s*[^\s,;}]+/gi,
      "$1=[redacted]",
    )
    .replaceAll(
      /\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
      "[redacted-token]",
    )
    .slice(0, 2_000);
}

export function asMarketingError(error) {
  if (error instanceof MarketingError) return error;
  return new MarketingError(
    "INTERNAL_ERROR",
    "Marketing operation failed.",
    undefined,
    error,
  );
}

export function errorResult(error) {
  const known = asMarketingError(error);
  return {
    ok: false,
    error: {
      code: known.code,
      message: sanitizeDiagnostic(known.message),
      ...(known.details ? { details: sanitizeValue(known.details) } : {}),
    },
  };
}

function sanitizeValue(value) {
  if (typeof value === "string") return sanitizeDiagnostic(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeValue(item)]),
    );
  }
  return value;
}
