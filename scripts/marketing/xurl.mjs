import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { MarketingError, sanitizeDiagnostic } from "./errors.mjs";

const execFile = promisify(execFileCallback);
export const XURL_VERSION = "1.3.1";
export const XURL_APP = "patchctl-marketing";

function parseJson(output, operation) {
  const clean = String(output)
    .replaceAll(/\u001b\[[0-9;]*m/g, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new MarketingError(
      operation === "post" ? "PUBLISH_OUTCOME_UNKNOWN" : "AUTH_NOT_CONFIGURED",
      `xurl returned an unreadable ${operation} response.`,
    );
  }
}

export class XurlTransport {
  constructor({ runner = execFile, executable = "xurl" } = {}) {
    if (executable !== "xurl")
      throw new MarketingError(
        "AUTH_NOT_CONFIGURED",
        "Publisher executable is fixed to xurl.",
      );
    this.runner = runner;
    this.executable = executable;
  }

  async invoke(args, operation) {
    try {
      const result = await this.runner(this.executable, args, {
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
        shell: false,
      });
      return parseJson(result.stdout, operation);
    } catch (error) {
      if (error.code === "ENOENT")
        throw new MarketingError(
          "AUTH_NOT_CONFIGURED",
          "Pinned xurl v1.3.1 is not installed in the publisher environment.",
        );
      const stdout = String(error.stdout ?? "")
        .replaceAll(/\u001b\[[0-9;]*m/g, "")
        .trim();
      if (stdout) {
        try {
          const parsed = JSON.parse(stdout);
          const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
          const first = errors[0];
          if (operation === "post") {
            const status = Number(first?.status);
            if (
              first &&
              Number.isInteger(status) &&
              status >= 400 &&
              status < 500
            ) {
              const message = sanitizeDiagnostic(
                first.detail ??
                  first.message ??
                  first.title ??
                  "X rejected the request.",
              );
              throw new MarketingError(
                "DEFINITIVE_API_ERROR",
                "X definitively rejected the post; no automatic retry was attempted.",
                {
                  reason: message,
                  code: first.code ?? status,
                  retryTiming: sanitizeDiagnostic(
                    first.retry_after ??
                      first.parameters?.retry_after ??
                      "not provided by xurl JSON response",
                  ),
                },
              );
            }
          } else {
            const identityError = first ?? parsed;
            throw new MarketingError(
              "AUTH_NOT_CONFIGURED",
              "xurl could not verify the authenticated account.",
              {
                reason: sanitizeDiagnostic(
                  identityError.detail ??
                    identityError.message ??
                    identityError.title ??
                    "Identity response was unsuccessful.",
                ),
              },
            );
          }
        } catch (parsedError) {
          if (parsedError instanceof MarketingError) throw parsedError;
        }
      }
      const diagnostic = sanitizeDiagnostic(error.stderr ?? error.message);
      if (operation === "post")
        throw new MarketingError(
          "PUBLISH_OUTCOME_UNKNOWN",
          "xurl did not return a definitive post result. Reconcile before any retry.",
          { diagnostic },
        );
      throw new MarketingError(
        "AUTH_NOT_CONFIGURED",
        "xurl authentication or account verification failed.",
        { diagnostic },
      );
    }
  }

  async verifyVersion() {
    try {
      const { stdout } = await this.runner(this.executable, ["version"], {
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 16 * 1024,
        windowsHide: true,
        shell: false,
      });
      if (
        !new RegExp(`\\b${XURL_VERSION.replaceAll(".", "\\.")}\\b`).test(
          String(stdout),
        )
      )
        throw new Error("version mismatch");
    } catch (error) {
      if (error instanceof MarketingError) throw error;
      throw new MarketingError(
        "AUTH_NOT_CONFIGURED",
        `Publisher requires reviewed xurl v${XURL_VERSION}.`,
      );
    }
  }

  async identity(account) {
    const username = account.replace(/^@/, "");
    const result = await this.invoke(
      [
        "--app",
        XURL_APP,
        "--username",
        username,
        "--auth",
        "oauth2",
        "/2/users/me",
      ],
      "identity",
    );
    if (!result.data?.id || !result.data?.username)
      throw new MarketingError(
        "AUTH_NOT_CONFIGURED",
        "xurl identity response did not identify the authenticated account.",
      );
    return {
      id: String(result.data.id),
      username: String(result.data.username),
    };
  }

  async post(text, account) {
    const username = account.replace(/^@/, "");
    const result = await this.invoke(
      [
        "--app",
        XURL_APP,
        "post",
        text,
        "--username",
        username,
        "--auth",
        "oauth2",
      ],
      "post",
    );
    const id = String(result.data?.id ?? "");
    if (!/^\d{1,30}$/.test(id))
      throw new MarketingError(
        "PUBLISH_OUTCOME_UNKNOWN",
        "X did not return a valid confirmed post ID. Reconcile before any retry.",
      );
    return {
      id,
      text:
        result.data.text === undefined ? undefined : String(result.data.text),
    };
  }
}
