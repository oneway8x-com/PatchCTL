# X controlled-publishing runbook

Official [xurl](https://docs.x.com/tools/xurl), [post creation](https://docs.x.com/x-api/posts/create-post),
[weighted counting](https://docs.x.com/resources/fundamentals/counting-characters),
[automation rules](https://help.x.com/en/rules-and-policies/x-automation),
[developer guidelines](https://docs.x.com/developer-guidelines), and
[pricing](https://docs.x.com/x-api/getting-started/pricing) were checked 2026-09-05, together with
the pinned official [`xurl` v1.3.1 source](https://github.com/xdevplatform/xurl/tree/v1.3.1).
Recheck before enabling live publication. No authentication or live social test was performed.

Content was rephrased for compliance with licensing restrictions.

## Scope and policy gate

The MVP permits one human-approved standalone text post, optionally containing an ordinary source
link. It excludes replies, mentions, threads, quotes, reposts, likes, follows, DMs, media, polls,
deletes, engagement automation, and scheduling. Use only the official API—never browser automation
or scraping. An internal safeguard such as one post per day is a maintainer cap, not an X quota.

X's help policy specifically requires prior written approval for AI-powered automated reply bots;
the developer guidelines use broader wording around AI-generated content and replies. Human review
does not itself prove an exemption. The operator must confirm that this exact standalone,
AI-assisted use case is permitted and obtain clarification before any unattended publishing.
Automated accounts must use the required account label and identify their operator. Credentials
prove authentication, not authorization for every activity.

X currently documents pay-per-use billing. Prices can change and URL posts may be billed
differently from text-only posts, so this repository hard-codes no price. In the Developer Console,
set a hard spending limit and keep auto-recharge disabled; this workflow never purchases credits.

## Trust and isolation

Use one persistent publisher environment under a separate OS identity or suitably isolated
runtime. A second terminal under the same unrestricted user is not credential isolation. Install
reviewed publisher code at a pinned revision, then pass only the reviewed bundle as data. Never run
an arbitrary agent-modified checkout with credentials or execute any script from a bundle.

This design does not resist a fully privileged agent, compromised publisher identity, or
compromised maintainer account. Skill metadata and prompts are not security boundaries. The trust
assumption is that agents cannot access the designated identity, its terminal, state directory, or
credentials, and that the maintainer reviews both publisher and payload revisions.

`xurl` stores app credentials and OAuth tokens in `~/.xurl/auth.yml`; that mode-600 file is a
secret, not automatically an OS keychain. Never read it into agent context, copy it into the repo,
use verbose auth logging, run `xurl token`, or paste keys/tokens into chat.

## One-time operator setup

Inside the isolated identity, install the reviewed official version (or verify a release binary
against the reviewed release), then configure OAuth2 user context manually:

```sh
GOBIN="$HOME/.local/bin" go install github.com/xdevplatform/xurl@v1.3.1
"$HOME/.local/bin/xurl" version
install -d -m 700 "$HOME/.xurl"
umask 077
"${EDITOR:?Set EDITOR in the isolated terminal}" "$HOME/.xurl/auth.yml"
chmod 600 "$HOME/.xurl/auth.yml"
xurl auth oauth2 --app patchctl-marketing EXPECTED_X_HANDLE
xurl auth default patchctl-marketing EXPECTED_X_HANDLE
xurl --app patchctl-marketing --username EXPECTED_X_HANDLE --auth oauth2 /2/users/me
```

Configure the app's callback (xurl defaults to `http://localhost:8080/callback`), user write scope,
pay-per-use enrollment if required, spending limit, disabled auto-recharge, use-case permission, and
account label before authentication. Do not put client IDs/secrets on command lines or in exported
environment variables in an agent session.

Create the external policy confirmation at the path reported by `pnpm marketing status BUNDLE`:

```json
{
  "version": 1,
  "project": "PatchCTL",
  "xurlVersion": "1.3.1",
  "platformPolicyConfirmedAt": "<current ISO-8601 UTC timestamp>",
  "useCase": "human-approved-standalone-ai-assisted-text"
}
```

Save it as `publisher-policy.json` beside the printed `journal/` directory, mode 600. The
timestamp must use UTC `Z` syntax, must not be over 30 days old, and may be at most five minutes in
the future; reconfirm sooner whenever platform terms or the use case change. This file is an
operator prerequisite, not payload approval, and a privileged process could forge it.

## Review and publish

```sh
BUNDLE=marketing/build-in-public/2026-09-05-local-first-review
pnpm marketing validate "$BUNDLE" --json
pnpm marketing preview "$BUNDLE" --channel x --json
pnpm marketing publish "$BUNDLE" --channel x --dry-run
pnpm marketing status "$BUNDLE" --json
pnpm marketing publish "$BUNDLE" --channel x --live --expected-hash '<fingerprint from preview>'
```

Offline preview shows the exact normalized text, weighted count, account, destination, options,
revision, blockers, and fingerprint. The fingerprint also binds the update ID and source revision.
Live mode revalidates, copies those exact values into an in-memory snapshot, checks pinned xurl and
the authenticated `/2/users/me` response for the selected OAuth2 token, then requires the human to
type a fingerprint-specific phrase in the isolated terminal. It rechecks the owner-only policy file
under the journal lock immediately before persisting an attempt or sending. There is no `--yes` or
environment approval. The subprocess uses fixed argv without a shell; bundle fields cannot choose an
executable, endpoint, header, auth path, or app. Errors are bounded and sanitized.

Do not set `PATCHCTL_MARKETING_HOME` for routine approval/live use. It exists for disposable tests
and exceptional isolated state relocation; changing it can select a different authoritative
journal.

## Journal backup and recovery

`status --json` prints the authoritative journal path. While the publisher is stopped, copy the
entire external state directory (including `publisher-policy.json`, `journal/`, and lock evidence)
to protected storage with owner-only permissions. Restore only after verifying project/update/
channel/account identity. Public receipts are audit copies, not deduplication state.

A pending/unknown attempt blocks another POST. Do not clear state, change update ID, edit text, or
retry to make ambiguity disappear. Independently verify the post, then record it without reposting:

```sh
pnpm marketing reconcile "$BUNDLE" --channel x \
  --remote-id '<verified id>' \
  --remote-url 'https://x.com/<approved account>/status/<verified id>' \
  --published-at '<verified ISO timestamp>'
```

If the operator and provider independently establish that no post was created:

```sh
pnpm marketing reconcile "$BUNDLE" --channel x --no-post \
  --reason '<preserved independent verification and decision>'
```

Both paths require an interactive operator phrase, require the current bundle fingerprint and
source revision to match the persisted attempt, and preserve attempt history. An unavailable search
result is never proof that no post exists. If the journal records `published` but the public receipt
write failed, repair only that receipt—without another POST—with:

```sh
pnpm marketing reconcile "$BUNDLE" --channel x --repair-receipt
```

Receipt repair is idempotent for exact receipt content and uses atomic create-if-absent semantics to
refuse a concurrent, conflicting, or symbolic-link receipt. Malformed or unknown journal attempt
states block publication until trusted recovery. Only a structured X 4xx error is treated as a
definitive rejection; every malformed, success-shaped, transport, or otherwise uncertain failure
remains ambiguous and blocks retries. The MVP does not auto-retry. Exactly-once delivery across X
and local disk is not promised.

Locks fail closed. If a lock remains after interruption, first stop the publisher, preserve a backup,
verify no publisher process is running, and inspect the journal for a pending or ambiguous attempt.
Remove a stale lock directory manually only after those checks; never remove it merely to retry.

## Disable and revoke

Stop using live mode, back up the journal, move `publisher-policy.json` out of the active state
directory, then in the isolated identity run:

```sh
xurl auth clear --oauth2-username EXPECTED_X_HANDLE
xurl auth apps remove patchctl-marketing
xurl auth status
```

Revoke the token/app in the X Developer Portal and verify no usable credential remains. There is no
repository schedule or service to disable in this MVP.
