# Deep Verify: PR #37 harden routes and headers (2026-09-19)

Overall: PASS
Tested-SHA: 0497749c11bf65802fa52638fec78f0266659b42

This report covers two runs on the same day:
- **Run 1**, on `12126df`, came out FAIL on two blockers:
  - B1: the rate limit could be bypassed with XFF rotation;
  - B2: the yq sha256 step never verified anything and broke CI.
- **Run 2** is the re-verify on `0497749`, which fixes both, along with W1,
  W2, W4 and W5. Every claim held, so the verdict above is for `0497749`.
- Run 1's findings are kept below as history.

## 0. Re-verify on 0497749 (run 2)

### Scope and environment

- **Target:** `chore/harden-routes-headers` at `0497749`, whose parent is
  `9136aff` (run 1's report commit on top of `12126df`). The worktree was
  pulled with `git pull --ff-only`.
- **Image:** a fresh image, `demo-lumen:dv37r2`, built with `--no-cache` from
  the clean worktree at `0497749`:
  - the same temporary-npmrc handling as run 1;
  - the npmrc was deleted right after the build;
  - the build log carries 0 token-shaped strings;
  - `next build` compiled successfully.
- **Containers:** the same throwaway layout and throwaway env as run 1, on
  `dvl37-net`, with freshly minted RS256 portal tokens:

  | Container | Port | Role |
  |---|---|---|
  | `dvl37-app` | 18821 | main target |
  | `dvl37-appfail` | 18822 | webhook host that does not resolve |
  | `dvl37-proxy` | 18823 | nginx replica of the live proxy headers |
  | `dvl37-nocfg` | 18824 | no `PORTAL_*` env |
  | `dvl37-nosecret` | 18825 | no `SESSION_SECRET` |
  | `dvl37-sink` | 18829 | webhook and JWKS sink that counts deliveries |

  All ports are on 127.0.0.1.
- **Untouched:** the live container, the public URL, the demo-proxy and
  cloudflare-config. Nothing reached Slack or the real portal.
- **Mode:** as in run 1: QUICK+EDGE (DEEP REQUESTED, LAYER 5 NOT RUN), with
  no adversarial generator.

### (5) Diff review: `12126df..0497749`

- `git diff --stat 12126df 0497749` changes 8 files. One of them is this
  report, from run 1's commit `9136aff`; the builder did not touch it
  (`git diff 9136aff 0497749 -- verify/reports` is empty).
- **`slack/route.ts`:**
  - The per-IP `Map` and `getClientIp` are gone.
  - The limiter is one module-level `number[]`: old timestamps are dropped
    with `shift()`, and the call is refused once 5 fall inside 60 s.
  - The check runs synchronously before any `await`, so concurrent calls
    cannot race it (R5 confirms this).
  - No header is read for limiting.
- **`handoff/route.ts`:** `console.error("[portal/handoff] misconfigured:",
  err)` in both catch blocks. The response bodies are unchanged.
- **`settings/page.tsx`:** `lumenanalytics.io/app` becomes
  `lumen.example/app`.
- **`anomaly-panel.tsx`:** a 429 branch shows "Rate limited, try again in a
  minute." in the moderate color.
- **`verify.yml`:**
  - the checksums download and `grep` are removed;
  - `YQ_SHA256="a2c09718...13e9ed7"` is checked with `echo "<hash>
    /usr/local/bin/yq" | sha256sum -c -`.
- **`package-lock.json`:** `git diff origin/main 0497749 --
  package-lock.json` prints nothing.
- **`tests/slack-route.test.ts`:** one new test, "returns 429 on the 6th call
  even when X-Forwarded-For rotates on every call".
  - **Mutation check:** with the old `12126df` `route.ts` swapped in
    temporarily, this test fails (1 failed, 2 passed).
  - The file was restored with `git checkout HEAD --`, and `git status` was
    clean afterwards.

### Layer 1

- `npm run verify` exited 0: 15 files and **85 tests** passed, with no ESLint
  warnings or errors.
- **CI at `0497749` (run 35461534756):**
  - **Quick Verify passes.** The log shows `/usr/local/bin/yq: OK`.
  - Deep Verify failed only because the committed report still read FAIL.
    That is the expected state before this re-verify.

### (1) B1: the global rate limit (`r2/slack-direct.txt`, `r2/slack-proxy.txt`, `r2/slack-extra.txt`)

| Run | Setup | Result | Sink deliveries |
|---|---|---|---|
| R1 | no cookie | 401 | 0 |
| R2 | direct, 20 calls, a new `X-Forwarded-For` on each, arbitrary cookie | calls 1 to 5 got 200; **calls 6 to 20 got 429** | **5** |
| R3 | same window, rotating `X-Real-IP` and XFF together | 429, 429, 429 | 0 |
| R4 | fresh process, **through the nginx replica**, 15 calls with `X-Forwarded-For: 198.51.100.N, 203.0.113.7` | calls 1 to 5 got 200; **calls 6 to 15 got 429** | **5** |
| R5 | fresh process, 30 **concurrent** calls with distinct XFF values | 5 got 200, 25 got 429 | **5** |
| R6 | 61 s later | 200 (the window resets) | |

So, in every path, the 6th call in a window got 429 and at most 5 POSTs
reached the sink per window.

### (2) B2: the pinned yq hash (`r2/yq-step.txt`)

- A fresh download of the v4.44.3 `yq_linux_amd64` hashes to
  `a2c097180dd884a8d50c956ee16a9cec070f30a7947cf4ebf87d5f36213e9ed7`. That is
  the pinned value.
- The step's command was run in a `node:20-bookworm-slim` container:

  | Binary | Hash | Result |
  |---|---|---|
  | real | pinned | `OK`, exit 0 |
  | tampered (1 byte appended) | pinned | `FAILED`, exit 1 |
  | real | a wrong hash (all zeros) | `FAILED`, exit 1 |
  | tampered, under `bash -e` like Actions | pinned | the step exits 1 before reaching `chmod` |

- CI Quick Verify is green (see Layer 1).

### (3) W1, W2, W4 and W5

- **W1:** in headless Chromium, clicks 1 to 5 read "Delivered to
  dvl37-sink:8080 (HTTP 200)." Click 6 got 429 and read **"Rate limited, try
  again in a minute."** Confirmed.
- **W2:** both misconfigured containers still return 500
  `{"error":"misconfigured"}` with nothing more in the body. The container
  logs now carry the reason, naming the missing variables but no values:
  - `[portal/handoff] misconfigured: Error: Portal federation env vars
    missing: PORTAL_JWKS_URL, PORTAL_EXPECTED_ISSUER, PORTAL_EXPECTED_AUD`;
  - `[portal/handoff] misconfigured: Error: SESSION_SECRET must be set to a
    value of at least 32 characters`.

  Confirmed.
- **W4:** `/app/settings` renders `lumen.example/app` twice and
  `lumenanalytics.io` 0 times. `git grep lumenanalytics.io 0497749` (outside
  this report) finds nothing. Confirmed.
- **W5:** `git diff origin/main 0497749 -- package-lock.json` is empty.
  Confirmed.

### (4) Regression: attacks B, C and F from run 1

- **B, handoff shape:** `portal-token-claim.tsx` is unchanged by the fix and
  the handoff bodies are unchanged. In the browser:
  - a valid fragment token lands on `/app` with a cookie set, and the
    fragment is scrubbed;
  - a token signed with the wrong key shows the fallback banner, sets no
    cookie, and scrubs the fragment.

  portal-shell is unchanged since run 1.
- **C, framing:**
  - a cross-origin parent gets `chrome-error://chromewebdata/` in the frame
    (blocked);
  - a same-origin parent loads `/`.

  XFO and CSP appear on a page, a 307, `/api/team` and `/_next/static`, and
  there is no `X-Powered-By`.
- **F, flows:**
  - Sign-in gives a `Secure; HttpOnly; SameSite=lax` cookie and lands on
    `/app`.
  - Triage: 23 rows, and Acknowledge returned 200.
  - Sign-out returns 303, and `/app` then redirects to `/?signin=required`.
  - `GET /api/session` returns 405.
  - Handoff:

    | Case | Response |
    |---|---|
    | invalid JSON | 400 |
    | empty token | 401 |
    | wrong `aud` | 401 |
    | wrong `iss` | 401 |
    | expired | 401 |
    | wrong key | 401 |
    | valid | 200 with a Secure JWT cookie |

  - With a webhook host that does not resolve, the response says "delivery
    failed".
  - The only console errors were the expected 429 and 401 resource lines.
- **Repo smoke:** `quick_smoke.sh verify/smoke.yml` against `dvl37-app` got
  10 ok and 1 FAIL, the same as run 1. The FAIL is HSTS, which the Cloudflare
  edge adds (N/A locally).

### Theater Check (run 2)

| Claim at 0497749 | Verification found | Verdict |
|---|---|---|
| B1: one global window, 5 per 60 s, with the per-IP map removed | R2 to R6: the 6th call gets 429 whatever the headers, directly, through the proxy and under 30-way concurrency; 5 deliveries per window; the window resets | CONFIRMED |
| B2: yq SHA-256 hard-coded, and Quick Verify green | Good binary OK; tampered binary and wrong hash both exit 1; CI log shows `yq: OK` | CONFIRMED |
| W1: a 429 shows a rate-limit message | Browser click 6 reads "Rate limited, try again in a minute." | CONFIRMED |
| W2: `console.error` in both misconfig catches | Both reasons appear in the container logs, and the bodies stay generic | CONFIRMED |
| W4: `lumen.example/app` | Rendered; no `lumenanalytics.io` left in the tree | CONFIRMED |
| W5: lockfile byte-identical to main | Empty diff | CONFIRMED |
| 85 tests | 15 files, 85 tests; the new test catches the old code | CONFIRMED |
| All other run-1 claims (401, "delivery failed", Secure cookie, generic handoff errors, headers, emails) | Re-measured above, same as run 1 | CONFIRMED |

### Still open (none of these block this PR)

- **The global window can be drained by anyone (new W8).** Requests with
  invalid JSON use up the budget too: after 5 `junk` bodies, a real request
  got 429 (R7). Combined with the presence-only cookie check (any value
  passes), one anonymous client sending about 5 requests a minute can keep
  Send to Slack at 429 for every visitor.
  - This is the direct cost of the global limit the spec asked for. It
    trades availability of the demo button for a hard cap on webhook
    traffic, and cannot be abused beyond 5 deliveries a minute.
  - Fix, if wanted: count only requests that reach the send (after body and
    id validation). That is cheap, but a valid body can still drain the
    budget, so the design tradeoff stays.
  - Tier: Haiku, or accept it.
- **The Slack 401 only checks that the cookie exists.** Validating its value
  would add little, because `POST /api/session` hands the demo cookie to
  anyone.
  - Tier: accept it, or Sonnet if the session becomes real.
- **W6 (from run 1):** `frame-ancestors 'self'` would block a future portal
  iframe tile. Today the portal uses `shape: subdomain`, and the live Neon row
  was not read.
  - Tier: Haiku, when needed.
- **W7 (from run 1):** the CI deep gate greps every report for a PASS marker
  rather than one for this PR.
  - Tier: Sonnet.

Run 2 artifacts are in
`C:\Users\Drama\AppData\Local\Temp\claude\C--dev\c411ea0d-b7a5-4294-9c55-34d74f91e960\scratchpad\verify-runs\lumen-pr37-deep\r2\`:
- `build.log` and `npm-verify.txt`;
- `mutation.txt`;
- `slack-direct.txt`, `slack-proxy.txt` and `slack-extra.txt`;
- `yq-step.txt`;
- `auth-headers.txt`;
- `headless.txt` and `framing.txt`;
- `assertions.txt`;
- screenshots `f1-*.png`, `f3-*.png` and `f5-*.png`.

---

## History: run 1 on 12126df (verdict FAIL, superseded by run 2)

Most of the hardening holds. These all behave as claimed:
- the Secure session cookie;
- the generic handoff errors;
- the "delivery failed" text;
- X-Frame-Options and CSP `frame-ancestors`, with `X-Powered-By` gone;
- the fictional emails.

The sign-in, triage and handoff flows show no regressions.

The verdict is FAIL because two claims do not hold:
1. **The Slack rate limit can be bypassed.** It is keyed on the leftmost
   `X-Forwarded-For` entry, which the client controls. 20 of 20 calls with a
   rotated XFF got 200 inside one 60 s window, directly. Through a replica of
   the live demo-proxy nginx config, 15 of 15 got 200. Every one of those
   calls delivered a real webhook POST to the sink. The spec asked for a
   global limit.
   - The 401 gate only checks that the cookie exists. `Cookie:
     lumen_demo_session=anything` passes.
   - So the net posture is: anyone can trigger the webhook, as often as they
     like, by sending a made-up cookie and rotating a header.
2. **The yq sha256 step verifies nothing, and it breaks CI.** yq's
   `checksums` file is not in `sha256sum` format: it has one line per file,
   with 30+ hash columns. `sha256sum -c` exits 1 with "no properly formatted
   checksum lines found" for the real binary and for a tampered one alike.
   - Quick Verify is red at the tested SHA.
   - Deep Verify (`needs: quick-verify`) is skipped, so the tier-3 gate
     cannot run at all.

### Run 1, 1. Target and scope

- **Target:** `Ginkobaloba/lumen-analytics` PR #37, branch
  `chore/harden-routes-headers`, head `12126df`. Its parent is `origin/main`
  `1b0b08b`. The PR is labeled `tier-3`.
- **Why deep:** the PR touches `demo-auth` (tier 3): the session cookie, the
  handoff error paths, and a public write route (`/api/alerts/slack`).
- **Mode:** deep requested, layer 5 not run (the dispatcher said no headed
  Chrome). The label per the skill's stop-gate rule is **QUICK+EDGE (DEEP
  REQUESTED, LAYER 5 NOT RUN)**. These layers ran:
  - Layer 1 (code);
  - Layer 2 (runtime);
  - Layers 3 and 4 (network and headless Chromium);
  - Layer 6 (edge cases plus the attack matrix).
- **Not run:** the adversarial generator.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC. It did not write the PR.
- **Environment:**
  - **Image:** one image, `demo-lumen:dv37`, labeled with the tested SHA, built
    from a clean worktree at `12126df` with `docker build --secret
    id=npmrc,...`.
  - **npm token:** the npmrc was a temporary file built from the agent token
    (`GHCR_AGENT_TOKEN`). It was deleted right after the build (checked with
    `Test-Path`, which returned False).
  - **Env:** the runtime env file was readable, but only its key names were
    printed. The containers ran on a **throwaway** env, not the real one:
    - a random `SESSION_SECRET`;
    - `PORTAL_*` pointing at a local JWKS sink with a locally generated RS256
      key;
    - `LUMEN_SLACK_WEBHOOK_URL` pointing at a local sink container.
    - Nothing reached Slack or the real portal.
  - **Containers:** six throwaway containers on network `dvl37-net`, all with
    0 restarts:

    | Container | Port | Role |
    |---|---|---|
    | `dvl37-app` | 127.0.0.1:18821 | main target |
    | `dvl37-appfail` | 127.0.0.1:18822 | webhook host that does not resolve |
    | `dvl37-proxy` | 127.0.0.1:18823 | nginx replica of the live `lumenanalytics.conf` proxy headers |
    | `dvl37-nocfg` | 127.0.0.1:18824 | no `PORTAL_*` env |
    | `dvl37-nosecret` | 127.0.0.1:18825 | no `SESSION_SECRET` |
    | `dvl37-sink` | 127.0.0.1:18829 | webhook and JWKS sink that counts deliveries |

- **Untouched:** the live container, the public URL, the demo-proxy and
  cloudflare-config. The only contact with `demo-proxy` was read-only: a
  `grep` of its conf.d for `forwarded` and `real_ip`.
- **Cleanup:** all `dvl37-*` containers, `dvl37-net` and the `dv37` image were
  removed after this report was written.

### Run 1, 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| smoke | PASS (local) | `quick_smoke.sh verify/smoke.yml` against `dvl37-app`: 10 ok, 1 FAIL. The FAIL is HSTS, which the Cloudflare edge adds (N/A locally). `assertions/*.yml` have no `deploy_url`, so the runner treats them as a neutral skip |
| navigation | PASS | `/app` and `/app/anomalies` return a 307 to `/?signin=required` without a cookie. Sign-in lands on `/app` |
| auth_lifecycle | PASS with a caveat | Sign-in is a 303 plus a `Secure; HttpOnly; SameSite=lax` cookie. Sign-out clears it, and `/app` redirects afterwards. The handoff happy path sets a Secure JWT cookie and lands on `/app`. The Slack 401 gate checks presence only (S2) |
| data_crud | PASS | Triage acknowledge returned 200 from the UI. 23 anomaly rows render |
| error_handling | PASS with warnings | Handoff returns 400 `{"error":"bad_request"}`, 401 `{"error":"unauthorized"}` and 500 `{"error":"misconfigured"}`. The misconfig reason is now logged nowhere (W2). A 429 shows the wrong UI message (W1) |
| security_headers | PASS | `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'` appear on a page, a 307, an API route and `/_next/static`. There is no `X-Powered-By` |
| security (abuse) | **FAIL** | The rate limit can be bypassed with XFF rotation (B1) |
| CI | **FAIL** | The yq checksum step always fails (B2) |
| performance | not measured | No perf-relevant change |
| accessibility | SKIP | axe is not in the harness |
| mobile_responsive | SKIP | No layout change |
| visual_regression | SKIP | No baseline |
| cross_browser | SKIP | Chromium only; layer 5 not run |

#### Run 1: Layer 1: code

- `npm run verify` in the worktree exited 0:
  - typecheck, 15 test files and **84 tests** passed;
  - ESLint had no warnings or errors.
- In the image, `next build` compiled.
- CI at `12126df`:
  - **Quick Verify fails** in "Install yq" (run 35457192297):
    `sha256sum: /dev/fd/63: no properly formatted checksum lines found`.
  - Deep Verify is skipped.
- **Diff review:** 11 files changed. Beyond the summary, `package-lock.json`
  drops the `libc` fields from 20 optional native packages (sharp and others).
  That is npm-version churn and the PR body does not mention it (W5).

#### Run 1: Attack A: the rate limit and X-Forwarded-For (`slack-direct.txt`, `slack-proxy.txt`)

The key is `getClientIp()`: the first comma-separated entry of
`x-forwarded-for`, else `x-real-ip`, else `"unknown"`.

**Direct to the container (`dvl37-app`):**

| Step | Result |
|---|---|
| S1: no cookie | 401 `{"error":"unauthorized"}` |
| S2: `Cookie: lumen_demo_session=anything` | 200, delivered to the sink |
| S3: calls 2 to 5 with the same client | 200. The next ones, which are the 6th and later in the window counting S2, got 429 |
| S4: 20 calls, each with a new `X-Forwarded-For: 10.9.9.N` | **20 of 20 got 200** |
| Sink count | 5, then **25** after S4 |

**Through `dvl37-proxy`,** which carries the live demo-proxy directives
(`X-Real-IP $remote_addr` and `X-Forwarded-For $proxy_add_x_forwarded_for`,
with no `real_ip` module in the live conf.d or `nginx.conf`):
- Without spoofing, calls 1 to 5 got 200 and calls 6 and 7 got 429.
- With `X-Forwarded-For: 198.51.100.N, 203.0.113.7`, **15 of 15 got 200**.
  That header shape is what the app would receive once Cloudflare appends the
  real client IP to a client-supplied header.
- The sink counted 20 deliveries during this run.

**Which entry the attacker controls:**
- Cloudflare **appends** the connecting IP to an existing `X-Forwarded-For`
  and does not replace it. That is Cloudflare's documented behavior; it was
  not measured here, because the live edge was not touched.
- nginx's `$proxy_add_x_forwarded_for` then appends cloudflared's address.
- So the leftmost entry, which is the one the app keys on, is whatever the
  client sent.

**X-Real-IP is dead code.**
- S5 rotated only `X-Real-IP` and stayed at 429.
- Next's `base-server.js` (line 568) sets `req.headers['x-forwarded-for'] ??=
  socket.remoteAddress`. So `x-forwarded-for` is always present, and the
  `x-real-ip` fallback never runs.
- Behind the live proxy, `X-Real-IP` is cloudflared's address for every
  visitor anyway.

**Side effect:** `requestHistory` is an unbounded `Map`. Each spoofed key adds
an entry that is never evicted (W3).

#### Run 1: Attack B: consumers of the handoff error shape

- **In this repo:** `src/components/portal-token-claim.tsx` is the only
  client. `claim()` throws on `!res.ok` before it parses the body, so an error
  body is never read. The success body still carries `ok: true` and
  `redirect`, and the client checks both. Nothing in `src/`, `verify/`,
  `mcp/` or `scripts/` reads `detail`.
- **In portal-shell (read-only, `main` at `21ec4c9`):**
  - there are no references to `/api/portal/handoff`;
  - `/api/portal/launch/[slug]` only redirects the browser to
    `<app>#portal_token=<JWT>`, so the portal never sees the handoff response.
- **Browser (F5):**
  - A valid fragment token lands on `/app` with a cookie set, and the
    fragment is scrubbed.
  - A token signed with the wrong key shows the banner "We could not verify
    the portal handoff. Use the sign-in button below.", sets no cookie, and
    scrubs the fragment.
- **Verdict: nothing breaks.**

#### Run 1: Attack C: framing

- **portal-shell:**
  - `apps/manifests/lumen-analytics.json` has `"shape": "subdomain"`.
  - `src/app/app/[slug]/page.tsx` redirects subdomain apps to `app.url`
    before it would render the `<iframe>`.
  - So the portal does not embed Lumen today, and 'self' breaks nothing.
- **Live DB not read:** the live Neon row was not checked. `createAppAction`
  in `src/app/admin/actions.ts` accepts `shape=iframe`, so an operator could
  register an iframe tile that would then be blocked (W6).
- **Browser (F6, `framing.txt`):**
  - A cross-origin parent (`http://portal.dv37.test`) gets
    `chrome-error://chromewebdata/` in the frame, so it is blocked.
  - A same-origin parent loads `http://127.0.0.1:18821/` in the frame.
- **Lumen itself:** `src/` and `public/` contain no iframes.

#### Run 1: Attack D: the yq sha256 step (`yq-step.txt`)

The step was reproduced verbatim in a `node:20-bookworm-slim` container
against the real v4.44.3 `checksums` file:

| Binary | Step as written | Corrected parse |
|---|---|---|
| real | FAIL, "no properly formatted checksum lines found" | `OK` |
| tampered (1 byte appended) | FAIL, same message | `FAILED`, "1 computed checksum did NOT match" |

- The corrected parse takes field 19 (SHA-256 in `checksums_hashes_order`)
  from the line where `$1 == "yq_linux_amd64"`.
- `grep yq_linux_amd64` matches 2 lines: the binary and
  `yq_linux_amd64.tar.gz`. A fix therefore has to match field 1 exactly.
- Field 19 is `a2c09718...13e9ed7`, which equals `sha256sum` of the real
  binary.
- The step as written cannot tell a good binary from a bad one, and it fails
  on every run.

#### Run 1: Attack E: real-looking domains

- **Emails:** all 8 catalog emails are now `@lumen.example`. The container DB
  `users` table has all 8 as `@lumen.example`, and `/app/settings` renders
  those 8 and no `@lumenanalytics.io`.
- **One remaining use:** `src/app/app/settings/page.tsx:65` still renders
  `value="lumenanalytics.io/app"`, 2 times in the page HTML.
- `lumenanalytics.io` is NXDOMAIN (`nslookup` via 1.1.1.1), so anyone can
  register it (W4).
- The other test domains are `example.com`.

#### Run 1: Attack F: regression (`headless.txt`, `auth-paths.txt`, `misconfig.txt`)

**Browser flows:**

| Check | Result |
|---|---|
| F1: sign-in from the landing form | `/app`, cookie `secure=true httpOnly=true` |
| F2: triage | 23 rows; Acknowledge POST returned 200 |
| F3: Send to Slack, 6 clicks | clicks 1 to 5 got 200 "Delivered to dvl37-sink:8080 (HTTP 200)."; click 6 got 429 |
| F4: sign-out | 303, then `/app` redirects to `/?signin=required` |

On the 429, the panel reads "No webhook configured (set
LUMEN_SLACK_WEBHOOK_URL)" (W1).

**Handoff fails closed:**

| Case | Response |
|---|---|
| invalid JSON | 400 |
| empty token | 401 |
| wrong `aud` | 401 |
| wrong `iss` | 401 |
| expired | 401 |
| wrong key | 401 |
| `PORTAL_*` missing | 500 `misconfigured` |
| `SESSION_SECRET` missing | 500 `misconfigured` |

**Other paths:**
- `GET /api/session` returns 405.
- `alerting.ts` with a webhook host that does not resolve returns `"error":
  "delivery failed"` and `delivered: false`.
- The Slack route still returns 400 for invalid JSON and 404 for an unknown
  id.

### Run 1, 3. Edge cases attempted

| Case | Result |
|---|---|
| Slack call with an arbitrary cookie value | 200, delivered |
| Rotated XFF, direct | 20 of 20 got 200 |
| Rotated XFF, through the nginx replica | 15 of 15 got 200 |
| Rotated X-Real-IP only | 429 (the fallback is dead code) |
| Tampered yq binary | the step as written fails the same way as the real binary |
| Cross-origin framing | blocked |
| Same-origin framing | allowed |
| Handoff with 4 bad-token variants and 2 misconfigurations | all fail closed with generic bodies |

### Run 1, 4. Theater Check

| PR claim | Verification found | Verdict |
|---|---|---|
| Slack route needs the session cookie (401 otherwise) | 401 with no cookie; but any value passes (presence check only) | CONFIRMED (presence only) |
| Rate limit: 429 on the 6th call within 60 s | Holds for one unchanged client | CONFIRMED for a single client |
| The limit caps calls (a global limit, per the spec) | Rotating XFF gives unlimited 200s and deliveries | THEATER |
| alerting.ts returns "delivery failed" | A1 | CONFIRMED |
| `/api/session` cookie is Secure in production | C1 and F1: `Secure` | CONFIRMED |
| Portal handoff errors are generic `{"error":"code"}` | H1 to H3, M1, M2 | CONFIRMED |
| `poweredByHeader: false` and XFO plus CSP on all routes | Header dump on a page, a 307, an API route and static; framing test | CONFIRMED |
| yq pinned to v4.44.3 | Present in the workflow | CONFIRMED |
| yq verified by sha256 | The step errors before comparing anything; CI is red | THEATER |
| Fictional emails use `@lumen.example` (8) | 8 of 8 in source, DB and UI | CONFIRMED |
| No real-looking domain remains (audit L7 intent) | `lumenanalytics.io/app` in settings; NXDOMAIN | NOT CONFIRMED (see W4) |
| 84 tests pass; build succeeds | 84 of 84; image build exit 0 | CONFIRMED |

### Run 1, 5. Blockers

- **B1. The rate limit can be bypassed, and the cookie gate can be forged.**
  - Fix:
    - Replace the per-IP key with one global window, as specified.
    - If a per-client limit is wanted as well, key it on `CF-Connecting-IP`,
      never on the leftmost XFF entry.
    - Optionally validate the cookie value, not just its presence.
    - Add a test that sends rotated XFF values and expects a 429.
  - Tier: Sonnet.
- **B2. The yq checksum step never verifies, and it breaks CI.**
  - Fix: use
    `echo "$(awk -v b="$YQ_BINARY" '$1==b{print $19}' /tmp/checksums)  /usr/local/bin/yq" | sha256sum -c -`.
    Alternatively, hard-code the SHA-256
    `a2c097180dd884a8d50c956ee16a9cec070f30a7947cf4ebf87d5f36213e9ed7`.
  - Tier: Haiku.

### Run 1, 6. Warnings

- **W1. A 429 shows "No webhook configured".** The panel sets
  `configured: false` on any non-2xx. The PR introduced the 429, so it
  introduced this wrong message. The panel stays usable. The dispatcher's
  criterion is "error UX that breaks"; this is misleading rather than broken.
  - Fix: branch on `r.status === 429` in `anomaly-panel.tsx`.
  - Tier: Haiku.
- **W2. The misconfig reason is now logged nowhere.** It is gone from both
  the body and the container logs (M3), so an operator cannot tell which env
  var is missing.
  - Fix: `console.error` the reason inside the `catch`.
  - Tier: Haiku.
- **W3. `requestHistory` grows without bound** for every spoofed key.
  - Fix: this goes away with the global limit; otherwise, evict old entries.
  - Tier: Haiku.
- **W4. `lumenanalytics.io/app` remains** in `settings/page.tsx:65`, and the
  domain can be registered.
  - Fix: change it to `lumen.example/app`.
  - Tier: Haiku.
- **W5. Undisclosed `package-lock.json` churn:** `libc` fields removed on 20
  entries.
  - Fix: regenerate with the repo's npm version, or disclose it.
  - Tier: Haiku.
- **W6. `frame-ancestors 'self'` blocks any future iframe tile.** The portal
  admin can register an app with `shape=iframe`. The live Neon row was not
  read.
  - Fix: if the tile is ever switched to iframe, add the portal origin to
    `frame-ancestors`.
  - Tier: Haiku.
- **W7. The CI gate is still not per-PR.** This carries over from #35.
  - Tier: Sonnet.

Run artifacts are in
`C:\Users\Drama\AppData\Local\Temp\claude\C--dev\c411ea0d-b7a5-4294-9c55-34d74f91e960\scratchpad\verify-runs\lumen-pr37-deep\`:
- `headers.txt`;
- `slack-direct.txt` and `slack-proxy.txt`;
- `auth-paths.txt` and `misconfig.txt`;
- `headless.txt` and `framing.txt`;
- `yq-step.txt` and `assertions.txt`;
- `smoke-local.txt`;
- `npm-verify.txt`;
- screenshots `f1-*.png`, `f3-*.png` and `f5-*.png`.
