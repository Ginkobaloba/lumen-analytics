# Deep Verify: PR #41 real signed demo session, per-client Slack limit (2026-09-19)

Overall: PASS
Tested-SHA: 51c833d6caf96f48908a9f4917039265643cc854

Independent run. The verifier did not write the code under test and worked
from the PR body, the diff and the source, not from the builder's word.

## 1. Scope and environment

- **Target:** `fix/real-demo-session` at `51c833d`, whose parent is
  `b9220c1` (#38). Worktree `C:\dev\lumen-analytics-wt-sess`, clean
  (`git status --porcelain` empty) before and after every step.
- **Mode:** QUICK+EDGE (DEEP REQUESTED, LAYER 5 NOT RUN). A headed Chrome run
  was excluded by the dispatch, so per the skill's Step 0 this is not labeled
  DEEP. Layers 1, 2, 3 and 6 ran in full; layer 4 (headless browser) was
  replaced by direct HTTP against the production standalone server, which is
  the surface the findings live on.
- **Image:** `demo-lumen:dv41`, built `--no-cache` from the unmodified
  worktree with the repo's own `Dockerfile` and
  `--secret id=npmrc,src=<path>` (the id the Dockerfile declares). The npmrc
  was passed by path only and never opened. `next build` compiled with no
  Edge-runtime warnings; the build log carries 0 token-shaped strings
  (`ghp_`, `github_pat_`, `_authToken`, `Bearer `).
  - Note for the record: the first build attempt failed with `401
    Unauthorized` on `@paradigm-codes/auth` because the GitHub token had just
    been rotated. The npmrc was refreshed by the parent session and the image
    used for every result below is the plain `npm ci` build. No vendoring or
    lockfile deviation survives in the tested image.
- **Containers:** throwaway, all on 127.0.0.1, all on `dvl41-net`. Every one
  runs the Dockerfile's own `CMD ["node", "server.js"]`, that is the Next
  standalone server, not `next start`.

  | Container | Port | Role |
  |---|---|---|
  | `dvl41-app` | 18831 | main target, `SESSION_SECRET` = throwaway A |
  | `dvl41-alt` | 18832 | same image, throwaway secret B |
  | `dvl41-nosecret` | 18833 | no `SESSION_SECRET` at all |
  | `dvl41-empty` | 18834 | `SESSION_SECRET=` (empty) |
  | `dvl41-short` | 18835 | 31-character secret |
  | `dvl41-placeholder` | 18836 | the literal from `.env.example` |
  | `dvl41-proxy` | 18837 | nginx replica of the live demo-proxy server block |
  | `dvl41-sink` | 18838 | fake portal JWKS, RS256 minter, webhook counter |

- **Secrets:** both session secrets are 64-character random throwaways
  generated in this run (`crypto.randomBytes(48).toString('base64url')`).
  Nothing under `C:\Users\Drama\.secrets` was read, opened, hashed or
  printed, and no `.env*` file was opened. The npmrc was referenced by path
  only. Prod's secret length was taken from the parent session and not
  re-checked here.
- **Untouched:** the live `demo-lumenanalytics` container, the public URL,
  demo-proxy, cloudflare-config, and another session's `dvh36-*` containers.
  Nothing reached Slack or the real portal.
- **Artifacts:** `<scratch>/verify-runs/lumen-pr41/` (`build.log`,
  `npm-verify.log`, `tokens.json`, `auth-sweep.json`, `signin.json`,
  `boundary.json`, `rate-*.json`, `failclosed-*.json`, `regress.json`).

## 2. Diff review

`git diff --name-only origin/main...HEAD` lists 22 files and nothing else:
the 4 route and lib source files, `src/middleware.ts`, 6 test files, 3 docs,
`CLAUDE.md`, `.env.example`, one ledger entry, and 3 files under `verify/`.

- **Nothing outside the stated set changed.** `git diff --stat
  origin/main...HEAD -- .github/ scripts/ package.json package-lock.json
  src/lib/db.ts next.config.mjs Dockerfile` prints nothing. So #37's yq pin
  and generic errors, the seed scripts, the dependency tree and the security
  headers are untouched by this PR.
- **#38's `verify/tier_map.yml` structure is kept.** The file still has the
  same header comment, the same `surfaces:` list of 8 entries with `name`,
  `tier`, `deep_verify_before_merge` and `reason`, and the same order. Only
  the `demo-auth` entry's `reason` text is rewritten.
- `verify/assertions/anomaly-detail.yml` and `anomaly-log.yml` get comment
  corrections that now match the code.
- `src/lib/portal-session.ts` imports `jose/jwt/sign` and `jose/jwt/verify`
  as subpaths, which is what keeps the JWE deflate path out of the Edge
  bundle. The build log confirms there is no Edge warning.

## 3. Layer 1: code

- `npm run verify` in the worktree exited 0: typecheck, mcp:typecheck,
  **21 test files, 145 tests, all passed**, and `No ESLint warnings or
  errors`. Matches the PR body exactly.
- CI at `51c833d`: Quick Verify passes; Deep Verify fails only because no
  report was committed yet, which is the expected pre-report state.

### Mutation checks (the fixtures are the builder's own, so they were attacked)

Each mutation was a temporary edit, then `git checkout HEAD -- .`, with
`git status --porcelain` empty afterwards.

| Mutation | Result |
|---|---|
| remove `algorithms: ["HS256"]` from `jwtVerify` | 1 middleware test fails |
| remove `maxTokenAge: SESSION_TTL_SECONDS` | 1 middleware test fails |
| remove `audience: SESSION_AUDIENCE` | 1 middleware test fails |
| remove `issuer: SESSION_ISSUER` | **all 9 middleware tests still pass** (W2) |
| revert `middleware.ts` to a presence check | 3 middleware tests fail |
| replace `clientKeyFromHeaders(request.headers)` with `null` | 2 slack-route tests fail |

The builder's two claimed mutation results (3 middleware tests, 2 limiter
tests) both reproduce. The issuer row is a genuine gap: see W2.

## 4. Attack 1: hostile cookies on every session surface

All 11 fixtures from `tests/helpers/session-tokens.ts` were re-minted
independently against the live container's secret, plus 13 more invented
here. Every value was sent as a real `Cookie` header to five surfaces on
`dvl41-app` (`auth-sweep.json`).

| Fixture | GET /app | POST /api/alerts/slack | POST /api/anomalies/1/status |
|---|---|---|---|
| valid session (control) | 200 | 404 anomaly not found | 404 anomaly not found |
| unsigned `demo-user` literal | 307 | 401 | 401 |
| empty value | 307 | 401 | 401 |
| forged with another secret | 307 | 401 | 401 |
| tampered payload, original signature | 307 | 401 | 401 |
| expired | 307 | 401 | 401 |
| alg none, no signature | 307 | 401 | 401 |
| HS512 with the right secret | 307 | 401 | 401 |
| missing jti | 307 | 401 | 401 |
| wrong audience | 307 | 401 | 401 |
| unknown `src` | 307 | 401 | 401 |
| older than the max age | 307 | 401 | 401 |
| **foreign issuer, right secret** | 307 | 401 | 401 |
| **`src: "admin"`** | 307 | 401 | 401 |
| **iat exactly 1 s past max age** | 307 | 401 | 401 |
| no `iss` claim at all | 307 | 401 | 401 |
| missing `sub` | 307 | 401 | 401 |
| empty `sub` | 307 | 401 | 401 |
| `aud` an array of wrong values | 307 | 401 | 401 |
| `not.a.jwt` | 307 | 401 | 401 |
| two JWTs concatenated | 307 | 401 | 401 |
| no cookie at all | 307 | 401 | 401 |

Every 307 goes to `/?signin=required` and carries
`Set-Cookie: lumen_demo_session=; Path=/; Expires=Thu, 01 Jan 1970 ...`, so
the bad cookie is cleared with the right path.

### Other routes checked for the same gap

`GET /api/anomalies/[id]` and `GET /api/team` answer identically with any
cookie or none. That matches `verify/tier_map.yml`, which classifies the team
API as tier 1 and the detail GET as read-only, so it is by design and not a
regression from this PR. See W3 for the stale sentence in the tier map that
describes the POST route as unauthenticated.

### Freshly minted boundary cases (`boundary.json`)

Minted against the container's live secret and sent in the same second:

| Token | /app | status route |
|---|---|---|
| `iat` now | 200 | 404 |
| `iat` now minus 3590 (inside max age) | 200 | 404 |
| `iat` now minus 3601 (1 s past max age) | 307 | 401 |
| `iat` now minus 3700 | 307 | 401 |
| `exp` now minus 1 | 307 | 401 |
| `iat` 300 s in the future | 307 | 401 |
| `exp` 24 h out, `iat` now | 200 | 404 |
| empty `jti` | 307 | 401 |
| `src` claim missing | 307 | 401 |
| `src: null` | 307 | 401 |

The max-age edge is exact. A future `iat` is refused, so the token age window
cannot be shifted forward. A hand-minted 24 h `exp` is accepted at first but
is still bounded to one hour of use by `maxTokenAge`, so the 1 h lifetime
holds even against a token the mint helpers would never produce. Only the
holder of `SESSION_SECRET` can build any of these, so none is an attacker
path.

### Cookie header abuse (raw socket, `probe-raw.mjs`)

Node's HTTP client refuses to send control characters, so these went over a
raw socket:

| Case | Result |
|---|---|
| `\x01` inside the cookie value | 400 Bad Request from the Node HTTP parser, before Next sees it |
| `\x00` inside the cookie value | 400 Bad Request |
| two `Cookie:` headers, bad then good | 200 (last wins) |
| two `Cookie:` headers, good then bad | 307 (last wins) |
| one header, `demo-user; <valid>` | 200 (last wins) |

Duplicate cookies resolve to the last occurrence in both orders and on both
the middleware and the API routes. See W5.

## 5. Attack 2: CF-Connecting-IP spoofing and the global ceiling

`dvl41-app` was restarted before each scenario so the module-level limiter
starts empty (`rate-*.json`). Every call carries a valid session.

| Scenario | Calls | Result |
|---|---|---|
| same CF IP, then a second IP | A, A, A, B, B | 200, 200, **429**, 200, 200 |
| **CF IP rotated on every call** | 12 distinct CF IPs | 5 pass, calls 6 to 12 all **429** |
| fixed CF IP, XFF and X-Real-IP rotated | 4 | 200, 200, **429**, 429 |
| no CF header, XFF rotated | 7 | 5 pass, 6th and 7th **429** |
| oversized CF value (60 chars), then non-IP CF value | 3 + 3 | first 5 pass, 6th **429** (global only) |
| through the nginx replica, 3 distinct CF IPs then 3 from one | 6 | 200, 200, 200, 200, 200, **429** |

- **Direct-to-host CF spoofing is capped by the global ceiling at 5 a
  minute.** Rotating `CF-Connecting-IP` buys a fresh per-client window but
  never a fresh global one, so 12 rotated identities still got exactly 5
  through.
- **X-Forwarded-For and X-Real-IP do nothing.** Rotating both under a fixed
  CF IP still hits 429 on the 3rd call, and with no CF header at all the
  limit stays the global 5 no matter how XFF moves. The source confirms it:
  `clientKeyFromHeaders` reads `cf-connecting-ip` and nothing else.
- **The per-client window is real in production, not just in tests.** The
  live server block (`cloudflare-config/nginx/conf.d/lumenanalytics.conf`,
  read only) sets Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto,
  Upgrade and Connection, and neither strips nor rewrites `CF-Connecting-IP`,
  so nginx passes the Cloudflare value through untouched. The replica proves
  it end to end: three distinct CF IPs through nginx each got their own
  window, which could not happen if nginx collapsed them onto `$remote_addr`.

### Both windows record only when both admit

The discriminating case (`rate-both-windows-record.json`):

| Call | Result |
|---|---|
| A #1, A #2 | 200, 200 |
| A #3 | **429**, client scope |
| B #1, B #2 | 200, 200 |
| C #1 | 200 |
| D #1 | **429**, global scope |
| C #2 | **429** |

A's refused third call consumed no global budget: exactly five calls
(A1, A2, B1, B2, C1) were admitted before the global window closed. If the
client-limited call had been recorded globally, C #1 would have been the one
to 429.

## 6. Attack 3: the 500-versus-401 oracle and anonymous budget

- **An anonymous caller consumes nothing.** 10 calls with no cookie and 10
  with `demo-user`, all from CF IPs, returned 401 and burned no budget: five
  authenticated calls from five fresh CF IPs immediately afterwards all
  passed (`rate-anon-consumes-nothing.json`). The session check runs before
  `limiter.check`, so this is structural, not luck.
- **The 500 oracle is real but thin.** With no cookie at all, both
  session-required routes answer `500 {"error":"misconfigured"}` on the
  misconfigured containers and `401` on the healthy ones. So an unauthenticated
  scanner can tell "this deployment has no usable SESSION_SECRET" from "your
  cookie is bad" without any credential. `docs/demos/lumen/decisions.md`
  argues for this deliberately ("rather than a 401 that would hide an
  operator error"), and the leak is a single bit about operator state on a
  fictional demo. Recorded as W4, not a blocker.
- Budget is consumed by authenticated calls that later 400 or 404, because
  the limiter runs before body parsing. That is a design choice, not a
  defect, and it matches the PR body's own "404, 404, 429" note.

## 7. Attack 4: sign-in mint and cookie attributes

Three consecutive `POST /api/session` calls on the standalone server
(`signin.json`):

- All three returned `303` with `Location: /app` (relative, as #37 required).
- Header `{"alg":"HS256","typ":"JWT"}`; payload carries `iss=lumen-analytics`,
  `aud=lumen-session`, `sub=demo@lumenanalytics.example`, `src=demo`,
  `customer_id=null`, `role=demo`, `jti`, `iat`, `exp`.
- `exp - iat` is 3600 on all three.
- **Three distinct `jti` UUIDs**, one per call.
- Set-Cookie: `lumen_demo_session=<jwt>; Path=/; Expires=Sat, 19 Sep 2026
  22:35:12 GMT; Secure; HttpOnly; SameSite=lax`. `Expires` equals `exp` to
  the second. `Secure` is present because the image sets
  `NODE_ENV=production`; the code gates it on exactly that.
- The minted cookie opens `/app` with 200.
- `POST /api/session?signout=1` returns 303 and
  `lumen_demo_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`.

## 8. Attack 5: the fail-closed matrix

Five surfaces against each secret state (`failclosed-*.json`). The portal
handoff was driven with a genuinely valid RS256 token minted by the sink and
verified against the sink's JWKS, so the 500 rows are real and not an
early 401.

| Surface | secret A | secret B | unset | empty | 31 chars | placeholder |
|---|---|---|---|---|---|---|
| `POST /api/session` | 303, cookie | 303, cookie | **500 misconfigured**, no cookie | **500**, no cookie | **500**, no cookie | 303, cookie |
| `POST /api/portal/handoff`, valid portal token | 200, cookie | 200, cookie | **500**, no cookie | **500**, no cookie | **500**, no cookie | 200, cookie |
| `POST /api/portal/handoff`, garbage token | 401 | 401 | 401 | 401 | 401 | 401 |
| `GET /app` with an A cookie | 200 | **307** | **307** | **307** | **307** | **307** |
| `POST /api/alerts/slack` | 404 | 401 | **500** | **500** | **500** | 401 |
| `POST /api/anomalies/1/status` | 404 | 401 | **500** | **500** | **500** | 401 |

- Unset, empty and 31 characters fail closed on all five surfaces. The claim
  holds exactly as worded.
- The handoff's order matters and is worth stating plainly: a garbage portal
  token gets 401 even with no `SESSION_SECRET`, because the portal token is
  verified before the Lumen session is minted. Both paths fail closed, they
  just fail at different steps.
- **`dvl41-alt` is the proof that the Edge middleware reads `SESSION_SECRET`
  at runtime in the standalone server.** Same image, different secret, and a
  cookie minted under secret A gets 307 there and 200 on `dvl41-app`. Nothing
  was baked in at build time.
- The 46-character placeholder from `.env.example` signs in and verifies
  normally. See W1.

## 9. Attack 6: the production standalone server

Every result in this report was taken against `node server.js` inside the
image (the Dockerfile's `CMD`, running the `.next/standalone` output), never
against `next start` and never against `npm run dev`. The Edge middleware ran
there for all of section 4, section 8 and the cross-secret test, so the claim
that it reads `SESSION_SECRET` at runtime in the real image is confirmed on
the real artifact.

## 10. Attack 7: regressions

- **#35, per-visitor triage.** With a valid session, `POST
  /api/anomalies/an-nps-2026-09-15/status` with
  `{"status":"false_positive","assigned_to":"attacker"}` returned 200
  `{"ok":true,"deprecated":true,...}` and the shared row was byte-identical
  before and after (`status` stayed `active`; the whole detail JSON compared
  equal). Unauthenticated, the same call is 401. The localStorage overlay in
  `src/lib/triage-overlay.ts` is untouched by this diff.
- **#37, headers.** `X-Frame-Options: SAMEORIGIN` and
  `Content-Security-Policy: frame-ancestors 'self'` are present on `/`,
  `/app` and `/api/team`; `X-Powered-By` is absent. `next.config.mjs` is not
  in the diff.
- **#37, yq pinning and generic errors.** `.github/` is not in the diff;
  `YQ_SHA256="a2c0971..."` and the `sha256sum -c -` step are as merged. The
  handoff still answers generic `unauthorized` / `misconfigured` bodies and
  logs the reason with `console.error`.
- **Seed guard.** `scripts/` and `src/lib/db/index.ts` are not in the diff.
- **Portal handoff still works.** A valid RS256 token yields 200 with a
  `src=portal` session carrying `jti`, `iat`, `exp`, `customer_id` and
  `role`, and that session opens `/app` with 200. An expired portal token is
  401.

## 11. Attack 8: L4, the portal jti claim, verified independently

The builder's claim was checked directly in `C:\dev\portal-shell`, read only,
at `21ec4c9`:

- `mintAccessToken` in `src/lib/jwt-signing.ts` chains
  `.setProtectedHeader({alg:"RS256", kid, typ:"JWT"})`, `.setIssuedAt`,
  `.setIssuer`, `.setAudience`, `.setSubject`, `.setExpirationTime` and
  payload claims `customer_id`, `role`, `portal_role`. There is no
  `.setJti(...)`.
- `grep -rn "setJti\|jti" src/` across the whole portal-shell source returns
  **zero hits**.

So the portal really does mint no `jti`, and the decision not to build the
used-jti set is correct rather than an excuse.

The replay risk it leaves open was reproduced live: the same fake portal
token POSTed three times to `/api/portal/handoff` returned 200 every time and
minted three different Lumen sessions
(`9361818d...`, `13d2e2cb...`, `6621bbc1...`). That is exactly the behavior
documented in the route comment, `docs/PORTAL_FEDERATION.md`, the tier map
and `decisions.md`, so it is a disclosed limitation, not a surprise. It is
not a blocker for this PR because the fix belongs in portal-shell first.

## 12. Results by category

| Category | Verdict | Evidence |
|---|---|---|
| smoke | PASS | all 7 containers answer `/` with 200; `/app/anomalies` renders 107 KB with real anomaly ids |
| navigation | PASS | sign-in 303 to `/app`, `/app` 200, sign-out 303 to `/` |
| auth_lifecycle | PASS | sections 4, 7, 8; 24 hostile values rejected on 3 surfaces, mint and clear both correct |
| data_crud | PASS | status route writes nothing; detail JSON identical before and after (section 10) |
| visual_regression | SKIPPED | no headed layer in this run; the diff touches no component or page file |
| performance | NOT ASSESSED | no perf claim in this PR |
| accessibility | NOT ASSESSED | no UI change in the diff |
| security_headers | PASS | section 10 |
| mobile_responsive | NOT ASSESSED | no UI change in the diff |
| error_handling | PASS | 400 on bad JSON, 404 on unknown id, 401 on bad session, 500 only on operator misconfiguration |
| cross_browser | NOT APPLICABLE | server-side change |
| edge_cases | PASS | sections 4, 5, 8; 13 invented fixtures beyond the builder's 11, all rejected |

## 13. Theater Check

| Claim in the PR body | Verification found | Verdict |
|---|---|---|
| One signed session format for both paths: HS256, jti, iat, exp 1 h, iss `lumen-analytics`, aud `lumen-session`, sub, src demo or portal | Decoded live from both paths: header `HS256`, all claims present, `exp - iat` 3600, `src=demo` from sign-in and `src=portal` from the handoff | CONFIRMED |
| The middleware verifies in the Edge runtime and clears a bad cookie | Cross-secret container proves the runtime read; every rejection carries `lumen_demo_session=; Path=/; Expires=Thu, 01 Jan 1970` | CONFIRMED |
| Both session-required routes check validity, not presence | 22 invalid values, including `demo-user`, all 401 on both routes; the presence-check mutation fails 3 tests | CONFIRMED |
| A missing or under-32-character secret fails closed on all 5 surfaces | Section 8 matrix: unset, empty and 31 chars give 500 or 307 on all five, and never set a cookie | CONFIRMED |
| Global 5 per minute kept, plus 2 per minute per CF-Connecting-IP | Section 5: 3rd call from one CF IP is 429, 6th overall is 429 across rotated IPs | CONFIRMED |
| X-Forwarded-For and X-Real-IP are never read | Rotating both changes nothing in either direction; only `cf-connecting-ip` is read in the source; the null-key mutation fails 2 tests | CONFIRMED |
| Recorded in both windows only when both admit | The A3-then-C1 discriminating case passes (section 5) | CONFIRMED |
| The map is pruned, with a 1000-key cap | Unit tests cover pruning and the cap; the code prunes on every call and evicts oldest-first at `MAX_TRACKED_CLIENTS` | CONFIRMED (unit level) |
| L4 not built because the portal mints no jti | `grep -rn jti` in portal-shell `src/` returns zero hits; `mintAccessToken` has no `.setJti`; replay reproduced live, 3 for 3 | CONFIRMED |
| 21 files, 145 tests, all green; build green with `SESSION_SECRET` unset and no Edge warnings | `npm run verify` exit 0, 21 files, 145 tests, no lint findings; the image built with no `SESSION_SECRET` and no Edge warning | CONFIRMED |
| Manual standalone-server probe: sign-in 303, `/app` 200 with the minted cookie, 307 with `demo-user` | Reproduced independently on `node server.js` in the image | CONFIRMED |
| Slack from one CF IP returned 404, 404, 429 | Reproduced exactly | CONFIRMED |
| Only the stated files changed; #38's tier_map structure kept | 22 files, all stated; `.github/`, `scripts/`, `package*.json`, `Dockerfile`, `next.config.mjs` and `src/lib/db.ts` all empty in the diff; tier_map keeps its 8 surfaces and shape | CONFIRMED |

Nothing in the PR body was found to be theater.

## 14. Blockers

None. The PR does what it says on the production artifact.

## 15. Warnings

- **W1. The `.env.example` placeholder is 46 characters, so it passes the
  length check and mints real sessions.** `dvl41-placeholder` signed in
  normally and its cookies verified. The stated claim is about length and
  holds, and prod's secret was confirmed 130 characters by the parent
  session, so this is not a live exposure. But an operator who copies
  `.env.example` into a deploy gets a working demo signed with a value that
  is public in the repo, and `readSessionSecret` will not warn.
  - Fix: reject the known placeholder literal (or any value present in
    `.env.example`) in `readSessionSecret`, and log why. Roughly three lines.
  - Tier: Sonnet. It touches the tier-3 auth file.
- **W2. The test suite does not pin the issuer check.** Removing
  `issuer: SESSION_ISSUER` from `jwtVerify` leaves all 9 middleware tests
  green, because `hostileCookies()` has a wrong-audience case but no
  foreign-issuer case. Runtime behavior is correct: a foreign-issuer token
  signed with the right secret is rejected on all three surfaces (section 4).
  The gap is coverage, so a future refactor could drop the pin silently.
  - Fix: add `"foreign issuer": await signSession({ iss: "evil-issuer" })`
    to `hostileCookies()` in `tests/helpers/session-tokens.ts`. One line.
  - Tier: Haiku.
- **W3. `verify/tier_map.yml` still describes the anomaly detail routes as
  unauthenticated.** The `anomaly-detail-panel` surface's `reason` says "The
  API routes do not require authentication; they check only whether the
  anomaly id exists in the database", and names `POST
  /api/anomalies/[id]/status` in the same sentence. That POST now requires a
  valid signed session. The `demo-auth` surface was updated, this one was
  not, and the tier map is the file the merge gate reads.
  - Fix: reword that `reason` to say the GET is read-only and unauthenticated
    while the POST requires a valid session and writes nothing.
  - Tier: Haiku.
- **W4. The 500-versus-401 split is an unauthenticated configuration
  oracle.** With no cookie at all, `/api/alerts/slack` and the status route
  answer 500 `misconfigured` on a deployment whose `SESSION_SECRET` is
  unusable, and 401 otherwise. Any scanner can read that bit. The behavior is
  deliberate per `decisions.md` and the operator signal is genuinely useful,
  so this is a recorded tradeoff rather than a defect.
  - Fix, only if the oracle is judged to matter: keep the 500 for callers
    that present a syntactically valid cookie and return 401 otherwise, or
    drop to 401 everywhere and rely on the `console.error` already in place.
  - Tier: accept it, or Sonnet if changed.
- **W5. Duplicate `lumen_demo_session` cookies resolve to the last one.**
  Sent as two `Cookie` headers or as one header with two pairs, in both
  orders, the last occurrence wins on the middleware and on the API routes.
  An attacker who can set a cookie on a parent domain can therefore push a
  visitor into a different session or log them out. The impact here is nil:
  the demo subject is fixed, nothing per-user is stored server side, and
  triage lives in the visitor's own localStorage. Recorded so it is not
  rediscovered as a surprise.
  - Fix: none warranted for this demo. Cookie prefixes (`__Host-`) would be
    the real answer if the session ever carried per-user state.
  - Tier: accept it.
- **W6. The branch is one commit behind `origin/main`.** `origin/main` is at
  `9721f3e` (#40, a `ledger:check` script); this branch's parent is
  `b9220c1`. A merge commit or a squash keeps the head SHA this report names,
  so the deep gate stays satisfied. A **rebase** would rewrite `51c833d` and
  invalidate this report, forcing a re-run.
  - Fix: merge, do not rebase. If a rebase is unavoidable, re-run deep verify
    on the new head.
  - Tier: process note, no code change.

## 16. Cleanup

All `dvl41-*` containers, the `dvl41-net` network and the `demo-lumen:dv41`
image were removed after the run. The throwaway secrets, the minted fixtures
and the probe scripts live only under the session scratch directory. The
worktree is clean: `git status --porcelain` prints nothing except this report
before it was committed.
