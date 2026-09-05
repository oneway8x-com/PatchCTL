# Reddit manual-export runbook

Policy checked 2026-09-05. The initial bundle has no selected community and no rules check, so publication is blocked.

## Rules

Reddit's [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) requires explicit approval before API access. The [Data API Terms](https://www.redditinc.com/policies/data-api-terms) require a separate agreement for commercial use or uses outside the expressly permitted terms, so PatchCTL's intended use must be clarified before any API work. This workflow does not use the API.

Reddit-wide rules do not grant permission to self-promote in a particular community. Reddit explains that [each community can set and enforce its own rules](https://support.reddithelp.com/hc/en-us/articles/360043503951-What-are-Reddit-s-rules), and its moderator guidance describes 10% as one community choice—not a universal permission—in [spam controls](https://support.reddithelp.com/hc/en-us/articles/28012014962580-How-do-I-keep-spam-out-of-my-community). Never rely on a universal “10% rule.”

Before export, a human must name one community, read its current rules and pinned guidance, confirm that project/self-promotional posts are allowed, choose the correct flair/title format, and record the rules URL and check time in a new manifest revision. Disclose maintainer/project affiliation and AI-assisted drafting where applicable. If rules are unclear, ask moderators or do not post.

## Manual export only

After the named-community check and human approval, validate and export the exact artifact:

```sh
BUNDLE=marketing/build-in-public/2026-09-05-local-first-review
pnpm marketing validate "$BUNDLE" --json
pnpm marketing export "$BUNDLE" --channel reddit
```

A human then reviews and manually pastes the exported title/body into the named community. Do not automate Reddit API calls, login, cookies, browser actions, posting, votes, comments, replies, cross-posts, deletion, or scheduling. Do not reuse account sessions in an agent runtime.

After a manual post, record its public URL and exact payload in a public-safe receipt/addendum. On uncertainty, inspect manually before retrying. Corrections use a new commit plus an edit/addendum or clearly linked corrective post; do not silently rewrite repository history.

Content was rephrased for compliance with licensing restrictions.
