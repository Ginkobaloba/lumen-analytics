# Deep Verify: PR #37 harden routes and headers (2026-09-19)

Overall: FAIL
Tested-SHA: 12126df7faaf681af36089476e1b856134ef22b8

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

## 1. Target and scope

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

## 2. Results by category

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

### Layer 1: code

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

### Attack A: the rate limit and X-Forwarded-For (`slack-direct.txt`, `slack-proxy.txt`)

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

### Attack B: consumers of the handoff error shape

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

### Attack C: framing

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

### Attack D: the yq sha256 step (`yq-step.txt`)

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

### Attack E: real-looking domains

- **Emails:** all 8 catalog emails are now `@lumen.example`. The container DB
  `users` table has all 8 as `@lumen.example`, and `/app/settings` renders
  those 8 and no `@lumenanalytics.io`.
- **One remaining use:** `src/app/app/settings/page.tsx:65` still renders
  `value="lumenanalytics.io/app"`, 2 times in the page HTML.
- `lumenanalytics.io` is NXDOMAIN (`nslookup` via 1.1.1.1), so anyone can
  register it (W4).
- The other test domains are `example.com`.

### Attack F: regression (`headless.txt`, `auth-paths.txt`, `misconfig.txt`)

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

## 3. Edge cases attempted

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

## 4. Theater Check

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

## 5. Blockers

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

## 6. Warnings

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
