# Deep Verify: PR #35 per-visitor anomaly triage (2026-09-19)

Overall: FAIL
Tested-SHA: 5cd8dd7b860d8ef30218329984211e0652ce6c4f

The Tier-3 fix itself holds. No HTTP request of any kind can change the
`anomalies` rows another visitor sees:
- 10,106 requests (every method, every `/api` route and page, with and without
  a cookie, bad ids, method-override headers, a fake Server Action, and a
  50-request burst) left the full-table SHA-256 identical;
- so did every triage click the headless run made afterwards (49 checks across
  six browser contexts);
- the SQLite WAL was 0 bytes at the end.

Visitor isolation, persistence across reloads, the seed guard's symmetric
restore and the session and handoff behavior all held.

The verdict is FAIL because the dispatcher's rule is "PASS only if every claim
held", and two claims did not:
1. **"Forward-only rules" is false.** A visitor can take an anomaly from
   False positive back to Acknowledged, and from Resolved to Acknowledged. The
   Acknowledge button stays enabled on both, and `computeNextTriageState` sets
   `acknowledged` unconditionally. The PR's own docstring says "false positive
   is terminal". This mirrors the deleted server code exactly, so it is not a
   regression. It is a claim that does not match the behavior.
2. **A wrong-schema overlay entry crashes the anomaly log.** An entry whose
   `assigneeName` is an object throws React error #31 on `/app/anomalies`
   (table and panel). The crash survives reloads, and nothing in the UI
   recovers from it. 15 of 16 malformed shapes rendered fine, invalid JSON
   included.

Both are per-visitor only, and neither touches shared state. Each is a small
fix (see Blockers). The PR does what it set out to do for the M1 finding. It
cannot carry a PASS under this gate until those two are fixed or the claims
are reworded and a re-verify confirms it.

## 1. Target and scope

- **Target:** `Ginkobaloba/lumen-analytics` PR #35, branch
  `fix/per-visitor-triage`, head `5cd8dd7`. Its parent is `origin/main`
  `1b0b08b`, so no rebase was needed. The PR is labeled `tier-3`.
- **Why deep:** the PR changes the `anomaly-detail-panel` and `anomaly-log`
  surfaces, both tier 3 in `verify/tier_map.yml`, and it closes a
  shared-visitor-state write (M1).
- **Mode:** deep requested, layer 5 unavailable by instruction. The label per
  the skill's stop-gate rule is **QUICK+EDGE (DEEP REQUESTED, LAYER 5 NOT
  RUN)**. These layers ran:
  - Layer 1 (code);
  - Layer 2 (runtime);
  - Layers 3 and 4 (network and headless Chromium);
  - Layer 6 (edge sweep plus the attack matrix).
- **Not run:**
  - Layer 5 (headed Chrome): the dispatcher said headless only.
  - The adversarial generator.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC, not a human. It did
  not write the PR.
- **Environment:**
  - **Image:** one image, `demo-lumen:dv35`, built from a `git archive` of
    `5cd8dd7` (a clean tree, not the worktree) with
    `docker build --secret id=npmrc,...`.
  - **npm token:** the npmrc was a temporary file built from the agent token
    (`GHCR_AGENT_TOKEN`). It was deleted right after the build. The build log
    carries 0 token strings.
  - **Build cache:** the `npm ci` layer came from cache. The PR changes no
    `package.json` or lockfile. `seed:full` and `next build` ran fresh:
    23 anomalies were detected, and the build compiled with no warnings.
  - **Containers:** two throwaway containers, both on the runtime env file
    `C:\Users\Drama\.secrets\demo_env_lumenanalytics.local.txt`. Only key
    names were ever printed.
    - `dvl35-a` on `127.0.0.1:18811` ran the HTTP sweep, the headless run and
      the repo assertions.
    - `dvl35-seed` on `127.0.0.1:18812` took the direct DB mutations and
      restarts.
  - **DB access:** the image has no `sqlite3` CLI. A small `better-sqlite3`
    probe (`dbq.mjs`) was copied in and run with `docker exec`.
- **Untouched:** the live `demo-lumenanalytics` container (still "Up 6 hours"
  at cleanup), the public URL, the demo-proxy and `C:\dev\cloudflare-config`.
  The only contact with the live container was one read-only
  `docker inspect` of its mounts (`[]`).
- **Cleanup:** both containers and the `dv35` image were removed.

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| smoke | PASS (1 stale assertion) | Repo assertions: 35 PASS, 1 FAIL, 2 N/A, 2 SKIP. The FAIL is a home.yml footer string that `main` also lacks (see Warnings) |
| navigation | PASS | `?focus=<id>` opens the panel, and closing clears the param (U-2, U-6). Log, overview and metric detail all render |
| data_crud | PASS | The shared table is read-only in practice: hash unchanged across 10,106 requests and all UI triage. Per-visitor writes land in localStorage only (U-3..U-11) |
| auth_lifecycle | PASS | Sign-in 303 plus an HttpOnly Lax cookie; signout clears it; `/app/*` without a cookie is a 307 to `/?signin=required`; handoff returns 400 and 401 as before (S-1..S-6) |
| error_handling | FAIL (per-visitor) | One wrong-schema overlay shape crashes `/app/anomalies` (C-assigneeName-object). 15 other shapes were fine |
| edge_cases | FAIL (per-visitor) | False positive and Resolved can move back to Acknowledged (F-1, and the follow-up probe). Multi-tab and concurrency were fine for real clicks |
| security (shared state) | PASS | See the attack sweep. The only remaining `UPDATE anomalies` in `src/` is the guard itself |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge |
| performance | PASS (local) | Home LCP 524 ms, anomaly log LCP 152 ms, at the local origin |
| accessibility | SKIP | axe is not in the harness |
| mobile_responsive | PASS (partial) | Triage works at 390x844 (M-1) |
| visual_regression | SKIP | No baseline |
| cross_browser | SKIP | Chromium only; layer 5 not run |

### Layer 1: code

At `5cd8dd7`, in the worktree:
- `npx vitest run`: 17 files, 94 tests passed.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: no warnings or errors.
- In the image: `next build` "Compiled successfully", with no warnings.
- `src/lib/anomaly-actions.ts` is gone. No import of `anomaly-actions` or
  `applyAnomalyAction` remains. `useRouter` is no longer imported by
  `anomaly-panel.tsx`.

Remaining writes to `anomalies` (from grepping `src/`, `mcp/` and `scripts/`):
- `src/lib/db/index.ts:56`: `UPDATE anomalies` inside the seed guard. It runs
  only on the first `openDb()` in a process, and only when drift exists.
- `src/lib/ml/run-detection.ts`: `DELETE FROM anomalies`, `INSERT INTO
  anomalies` and the snapshot writes. It is reached only from
  `scripts/detect.ts`, which runs at image build.
- `mcp/`: SELECT only. It is not in the image either (`/app/mcp` is absent).
- There are no `"use server"` files. No route calls `runDetection` or
  `createDb`.

The PR leaves these files untouched (`git diff --stat` is empty for them):
- `src/middleware.ts`;
- `src/app/api/session`;
- `src/app/api/portal`;
- `src/lib/portal-session.ts`;
- `src/lib/portal-jwks*.ts`;
- `src/components/portal-token-claim.tsx`.

### Attack 1: no HTTP request changes shared rows (dvl35-a)

Full-table SHA-256 of `SELECT * FROM anomalies ORDER BY id`, taken by the
in-container probe:

```
before sweep   {"anomalies":23,"anomaliesSha":"b709aced42b1bbd6603b3177966ca3ae669de3e52da1591821802f8e1ed7eb5c","snapshot":23,"drift":0}
after sweep    {"anomalies":23,"anomaliesSha":"b709aced42b1bbd6603b3177966ca3ae669de3e52da1591821802f8e1ed7eb5c","snapshot":23,"drift":0}
after all UI   {"anomalies":23,"anomaliesSha":"b709aced42b1bbd6603b3177966ca3ae669de3e52da1591821802f8e1ed7eb5c","snapshot":23,"drift":0}
lumen.db-wal at end: 0 bytes
```

The sweep (`sweep.mjs`, 10,106 requests, 16 at a time) covered:
- **Methods:** GET, HEAD, POST, PUT, PATCH, DELETE and OPTIONS.
- **Routes:**
  - every `/api` route: `anomalies/[id]`, `anomalies/[id]/status`, `team`,
    `session`, `session?signout=1`, `portal/handoff`, `alerts/slack`;
  - the unknown `/api/anomalies` and `/api/anomalies/status`;
  - `/`, `/app`, `/app/anomalies` and `/app/metrics`.
- **Ids:** all 23 real ids; the ids url-encoded with a trailing slash;
  `1`; an SQL-injection id; a path-traversal id.
- **Cookies:** none, `lumen_demo_session=` (empty), `=x`, and
  `=demo-user`.
- **Bodies:** every old action shape, a direct `status`/`assigned_to` field
  injection, an array body, `not json`, and an empty body.
- **Extras:**
  - `X-HTTP-Method-Override` set to PATCH, PUT and DELETE on the status route
    for every id;
  - a forged `Next-Action` header on three pages;
  - a burst of 50 concurrent `false_positive` POSTs on one id.

Status-route outcomes:
- no cookie: 401 `{"error":"Session required"}`;
- any cookie value, **including an empty one**, with valid JSON and a real id:
  200 `{"ok":true,"deprecated":true,...}`;
- invalid or empty JSON with a cookie: 400;
- unknown id with valid JSON and a cookie: 404;
- every other method: 405 (OPTIONS 204);
- trailing slash: 308.

No response from `/status` echoed a changed status. The forged `Next-Action`
logged "Server Reference ID did not match" three times and changed nothing.
The container ran throughout with 0 restarts.

### Attack 3: the seed guard (dvl35-seed, direct DB mutation plus restart)

Verbatim excerpts from `seedguard.log`:

```
G0 baseline: anomaliesSha b709aced...  snapshot 23  drift 0
G1 first request opens the DB: 200, "M1 guard" log lines: 0
G2 direct mutation (docker exec):
   an-activations-2026-08-18   assigned_to NULL -> 'u-tom'            (NULL -> non-NULL)
   an-churn_rate-2026-03-25    assigned_to 'u-jin' -> NULL            (non-NULL -> NULL)
   an-feature_adoption_api-..  status active -> false_positive, updated_at 2099
   an-nrr-2026-05-27           status and assigned_to both changed
   an-nps-2026-09-15           updated_at only
   an-dau-2025-11-01           severity low -> critical (a column the guard ignores)
   hash 787561b2...  drift 4
G3 same process still serves the drift: false_positive null 2099-01-01T00:00:00Z
G4 docker restart, first request: 200
   [lumen] restored 4 anomaly row(s) to seed state on startup (M1 guard)
   hash f7016b8b...  drift 0
   activations  active / NULL      (restored)
   churn_rate   resolved / u-jin   (restored)
   feature_adoption_api active / NULL / 2026-08-08 (restored, updated_at too)
   nrr-05-27    acknowledged / u-marcus (restored)
   nps-09-15    updated_at 2026-09-16 (restored as a side effect of the 4-row drift)
   dau-11-01    severity critical  (NOT restored)
   served: active null 2026-08-08T08:00:00Z
G5 updated_at-only drift plus a deleted row, restart: 0 guard lines, updated_at stays 2099, deleted row stays deleted
G5b inserted non-snapshot row plus 1 status drift, restart: "restored 1", the inserted row stays and GET /api/anomalies/an-bogus-2099-01-01 -> 200
G6 IS NOT truth table: NULL IS NOT 'u-x' = 1, 'u-x' IS NOT NULL = 1, NULL IS NOT NULL = 0, 'a' IS NOT 'a' = 0, NULL <> 'u-x' = NULL
```

What this proves:
- The restore is symmetric in both NULL directions and for `status`.
- The SQL is null-safe. `IS NOT` returns 1 where plain `<>` would return NULL
  and miss the NULL-direction drift.
- The guard is once per process, and it is lazy: it fires on the first
  request, not at boot.

Its scope is narrower than "restores any drift". See Warnings.

### Attacks 2, 4, 5, 6 and 8: headless Chromium (dvl35-a, 1280x900 and 390x844)

The `headless.log` below is verbatim, with long evidence cut at 200
characters.

```
PASS  S-1  POST /api/session sign-in sets lumen_demo_session (HttpOnly, Lax) and lands on /app  [demo-user httpOnly=true Lax http://127.0.0.1:18811/app]
PASS  U-1  anomaly log renders 23 seed rows, 3 active  [23 anomalies detected in the trailing 12 months, 3 active]
PASS  U-2  panel opens for T via ?focus, shows Active  [Critical Active · updated 42d ago]
PASS  U-3  Mark as false positive: panel badge -> False positive, button disables  [Critical False positive · updated just now]
PASS  U-4  no request to any /status endpoint and no non-GET /api call from triage  [status x0 writes ]
PASS  U-5  without reload, table row T -> False positive and active count 3 -> 2 (no router.refresh needed)  [False positive | 23 anomalies detected in the trailing 12 months, 2 active]
PASS  U-6  URL focus param cleared on close  [http://127.0.0.1:18811/app/anomalies]
PASS  U-7  Assign T3 to Priya: panel shows 'Assigned to Priya Raghavan', status stays Acknowledged  [Low Acknowledged Assigned to Priya Raghavan · updated just now]
PASS  U-8  table row T3 assignee -> Priya Raghavan without reload
PASS  U-9  Assign on an Active anomaly advances it to Acknowledged  [Low Acknowledged Assigned to Jin Park · updated just now]
INFO  forward-only probe: after False positive, Acknowledge button enabled = true
FAIL  F-1  false_positive is terminal (Acknowledge cannot move it back)  [ackEnabled=true -> Low Acknowledged Assigned to Jin Park · updated just now]
INFO  forward-only probe: on a Resolved anomaly, Acknowledge button enabled = true
PASS  P-1  after reload A still sees T False positive, T3 Priya  [False positive Priya Raghavan]
PASS  P-2  after reload the panel for T merges A's overlay (False positive)
PASS  U-10  overview feed reflects A's overlay (T shown False positive if in feed)  [T in feed]
PASS  U-11  metric detail list shows T as False positive for A
PASS  I-1  visitor B (own context, signed in) sees T Active, T2 Active, T3 Elena, 3 active
PASS  I-2  B's rows are identical to the seed rows A saw before triaging
PASS  I-3  B's localStorage has no overlay  [null]
PASS  I-4  B's panel for T shows Active
PASS  I-5  B's metric detail shows no False positive for T
PASS  I-6  fresh context C (no cookie): GET /api/anomalies/T -> status active, unassigned  [active null]
PASS  I-7  fresh context C signed in sees seed rows
PASS  X-1  tab 2 table updates M1 -> False positive via the storage event, no reload
PASS  X-2  tab2 acting from a stale panel builds on tab1's write (S1 stays False positive, assigned Tom)
PASS  X-3  two tabs clicking on different anomalies at once: both entries survive
INFO  raw interleaved read-modify-write race (writeOverlay's pattern), 2 tabs x 100: 107/200 keys survived
PASS  X-4  no console or page errors in any tab of context A, or in B
PASS  X-5  no /status request from any tab
PASS  C-invalid-json / C-array / C-null / C-string / C-number / C-entry-null / C-entry-string / C-entry-array /
      C-status-number / C-status-unknown / C-updatedAt-bad / C-proto / C-snake_case-shape / C-status-object /
      C-huge-20k-entries   (15 shapes: log, panel, overview and metric detail all render, 23 rows, 0 page errors)
FAIL  C-assigneeName-object  {"log":"CRASH","panel":"CRASH","overview":"ok","metric":"ok"} rows=0 errs=3 pageerror: Minified React error #31 (object with keys {first})
PASS  M-1  390x844: triage in the panel works, no errors
PASS  S-2  GET /api/session -> 405
PASS  S-3  POST /api/session?signout=1 clears the cookie
PASS  S-4  after signout /app/anomalies redirects to /?signin=required
FAIL  S-5  handoff: bad JSON 400, malformed token 401, missing token 401  [401 401 malformed 401 missing_token]
PASS  S-6  landing with #portal_token fragment: fragment scrubbed, claim fails quietly, no cookie  [banner=We could not verify the portal handoff. Use the sign-in button below.]
TOTAL 46/49 passed; FAIL: F-1, C-assigneeName-object, S-5
```

- **S-5 is a harness defect, not an app defect.** Playwright JSON-encoded the
  string `not json` into the valid JSON `"not json"`, which correctly yields
  `missing_token` 401. A raw curl with the body `not json` returns 400
  `{"ok":false,"error":"bad_request","detail":"request body is not valid
  JSON"}`, and the HTTP sweep also recorded handoff 400s. The corrected tally
  is **47 of 49, with 2 real FAILs**.
- In the corrupt-storage shapes, entries that are truthy but not objects
  (`entry-string`, `entry-array`, `status-number`, `status-unknown`,
  `status-object`) render a blank status cell. They do not crash, and
  Acknowledge recovers them.

Follow-up probes (`followup.log`, verbatim):

```
CRASH /app/anomalies body: Application error: a client-side exception has occurred while loading 127.0.0.1 (see the browser console for more information).
after reload still crashed: true
overview ok: true | feed has T row: true
after clearing storage rows: 23
resolved probe: before="Low Resolved Assigned to David Okafor · updated 277d ago" after Acknowledge="Low Acknowledged Assigned to David Okafor · updated just now"
seed false_positive probe: before="Low False positive Assigned to Marcus Webb · updated 289d ago" ackEnabled=true after="Low Acknowledged Assigned to Marcus Webb · updated just now"
panel GET /api/anomalies/<id> on open: 2; extra after one Acknowledge click: 1; final "Low Acknowledged · updated just now"
```

Screenshot of the crash: `crash-assigneeName-object.png`.

What the removal of `router.refresh()` means in practice:
- Same-tab list views update through the `lumen-triage-overlay-change` event
  (U-5, U-8, U-10, U-11). Other tabs update through the `storage` event
  (X-1).
- After each click the panel refetches `/api/anomalies/<id>` once. Every
  parent passes an inline `onClose`, which is in the panel effect's deps, so
  the overlay-triggered re-render re-runs the fetch and briefly shows the
  skeleton.
- The old `router.refresh()` caused the same re-render, so this is not new
  behavior. It is also why a "stale" second-tab panel is not stale in
  practice (X-2).

### Attack 7: unauthenticated GETs

- **`GET /api/anomalies/[id]`** returns the full anomaly detail with no
  session:
  - metric, series and contributors;
  - suggested actions;
  - `affected.preview`: the customer id, name, MRR, churn risk, plan, geo
    and industry of up to a few accounts.

  All 23 payloads (146 KB) carry 0 email addresses and 0 secret-like strings
  (`details.jsonl`). The customer names are fictional synthetic seed data;
  the landing page says so ("Illustrative customers. All names fictional.").

  The same data sits behind `/app/*`, whose cookie is not a credential: any
  value passes, and `/api/session` hands it out with no login. So this route
  exposes nothing sensitive, and nothing the demo does not already show to
  anyone.
- **`GET /api/team`** returns 8 fictional team members (id, name, role,
  initials, color). Nothing sensitive.
- **Not a GET, pre-existing, and untouched by this PR:** `POST
  /api/alerts/slack` needs no session. If `LUMEN_SLACK_WEBHOOK_URL` were ever
  set, anyone could make the demo post Block Kit messages to that Slack
  channel. It is not set in the runtime env file. See Warnings.

### Repo assertions (`assertions.log`, verbatim tally)

```
FAIL  home.text  "A demo product by Paradigm Coding Solutions"
N/A   smoke.home.hsts  Strict-Transport-Security is edge-only
N/A   anomaly-detail.yml /api/anomalies/1 -> 200  contradicts smoke.yml (same URL, 404); id 1 does not exist. Run against a real id below
PASS  anomaly-detail (real id)  200 with the asserted fields
SKIP  home.axe / anomaly-log.axe
Tally: {"PASS":35,"FAIL":1,"N/A":2,"SKIP":2}
```

- **The FAIL is stale on `main` too.** `src/app/page.tsx` is unchanged by
  this PR, and the footer reads "Built by Paradigm Coding Solutions. Demo
  product, all data is synthetic."
- The `redirects_to` checks were matched on the path (`/?signin=required`),
  because the asserted absolute URL is the public host.

## 3. Theater Check

| PR #35 claimed | Verification found | Verdict |
|---|---|---|
| Triage is a client-side localStorage overlay applied in the panel, log, feed, and the metric list and markers | Triage writes only `lumen_triage_overlay_v1`; 0 `/status` requests and 0 non-GET `/api` calls from the UI (U-4, X-5); the log, feed and metric list reflect it (U-5, U-10, U-11). Chart markers were not inspected on their own | CONFIRMED (markers by code read) |
| Forward-only transitions, mirroring the old server rules; "false positive is terminal for the demo" | Mirrors the old rules: yes. Forward-only: no. False positive -> Acknowledge -> Acknowledged (F-1, and the seed FP probe); Resolved -> Acknowledged. The Acknowledge button is enabled in both states | **THEATER** (the wording is false; the behavior equals the pre-fix server) |
| Visitor A's triage is never visible to B or a fresh client; A sees their own change next read | I-1..I-7 across 3 independent contexts; P-1, P-2 after reload; the API still serves the seed row | CONFIRMED |
| Corrupt-storage safety | Invalid JSON and 14 other bad shapes are safe. An entry with an object `assigneeName` crashes `/app/anomalies` persistently (React #31) | **PARTIAL** (claim holds for invalid JSON, not for a wrong schema) |
| The route never writes | Table hash identical before and after 10,106 requests and all UI activity; WAL 0 bytes | CONFIRMED |
| 401 without the `lumen_demo_session` cookie | 401 `Session required`. Note: an empty cookie value also passes (documented as a scanner filter only) | CONFIRMED |
| 404 for an unknown id | 404 `Anomaly not found` with valid JSON and a cookie. With invalid JSON the 400 wins (the JSON parse runs before the lookup) | CONFIRMED |
| 400 for bad JSON | 400 `Invalid JSON body` for `not json` and an empty body | CONFIRMED |
| `anomaly-actions.ts` deleted | File absent; no references remain | CONFIRMED |
| Seed snapshot plus a once-per-process guard in `openDb()` restores drift in `anomalies` | Symmetric NULL-direction and status restore after restart (G4); `IS NOT` is null-safe (G6); once per process (G3). Does not restore `updated_at`-only drift, other columns, deleted rows or inserted rows (G4, G5, G5b) | CONFIRMED for `status` and `assigned_to`; "any drift" is overstated |
| Guard purpose: "an already-running container whose SQLite file was mutated before this fix shipped" | That state cannot reach the new code. The live container mounts no volume (`Mounts: []`), so the new code only ever runs in a new container whose DB is freshly seeded at image build. A pre-fix DB has no snapshot table, and the guard skips it by design | **THEATER** (a harmless defense against direct DB tampering, not the stated scenario) |
| `router.refresh()` removal broke nothing | Lists update in place without reload; tabs sync; no console errors (U-5, U-8, X-1, X-4) | CONFIRMED |
| typecheck, test (17/94), lint, build all green | Reproduced exactly | CONFIRMED |
| (Brief) Portal handoff and session unchanged | Files untouched by the diff; runtime S-1..S-6 (with S-5 corrected by curl) | CONFIRMED (valid-token handoff not exercised) |

## 4. Blockers

Neither blocker is a shared-state defect. Both block a PASS only because the
gate's rule is that every claim must hold.

### B1. "Forward-only" triage is not forward-only

- **Evidence:** F-1 and the follow-up probes. In a fresh browser, a seed
  `false_positive` becomes `acknowledged` on one click, and a `resolved`
  anomaly does too.
- **Cause:**
  - `computeNextTriageState` sets `status = "acknowledged"` for any current
    status;
  - `anomaly-panel.tsx` disables Acknowledge only when
    `status === "acknowledged"`.
- **Fix:** pick one of these, then re-verify.
  - Make `acknowledge` move only `active` to `acknowledged`, and return the
    current state or an error otherwise. Disable the button unless
    `status === "active"`. Add a test for FP and Resolved staying put.
  - Or keep the behavior and remove "forward-only" and "terminal" from the
    PR body, the docstring and `decisions.md`.
- **Agent tier:** Sonnet (one pure function, one prop and one test).

### B2. A wrong-schema overlay entry crashes the anomaly log

- **Evidence:** C-assigneeName-object and `crash-assigneeName-object.png`.
  React #31 on `/app/anomalies`, in both the table and the panel. It survives
  reloads. Only clearing site data recovers, because `clearOverlay` is not
  wired to any UI.
- **Cause:** `safeParse` checks only that the top level is an object, and
  `mergeEntry` spreads each entry unchecked into the rendered props.
- **Likelihood:** low today. The app itself never writes that shape, and the
  key is `_v1`. It becomes likely the day the overlay shape changes without a
  key bump, or if any other script on the origin writes the key.
- **Fix:** validate each entry in `readOverlay` or `mergeEntry`:
  - `status` must be one of the four known values;
  - `assignedTo` and `assigneeName` must be string or null;
  - `updatedAt` must be a string;
  - drop any entry that fails.

  Add a wrong-schema test next to the existing invalid-JSON one.
- **Agent tier:** Sonnet.

## 5. Warnings

### The seed guard does less than its comments say

- **Scenario:** its stated scenario (pre-fix drift in a running container)
  cannot reach the new code, as the Theater Check shows. As built, it only
  defends against direct tampering with the DB file.
- **Scope:** it detects `status` and `assigned_to` only.
  - `updated_at`-only drift is not repaired (G5).
  - Drift in other columns (`severity`) is not repaired (G4).
  - A deleted anomaly stays deleted (G5).
  - An inserted row stays and is served by the API (G5b).
- **Fix:** either reword the comments and `decisions.md` to "defense against
  direct DB tampering, covers status and assignee", or broaden the guard:
  - compare every column;
  - delete non-snapshot ids;
  - re-insert missing ids from a full-row snapshot.
- **Agent tier:** Haiku for the rewording, Sonnet for broadening.

### The Tier-3 CI gate is not per-PR (carried from the PR #30 report)

- CI "Deep Verify (tier-3 PRs only)" is **FAILURE** on `5cd8dd7`, run
  35430109619. That is correct today, because no report under
  `verify/reports/` has a PASS marker. This FAIL report keeps it red.
- `verify/ci/deep_gate.sh` greps **every** report for `overall: pass`. So the
  first PASS report merged to `main` turns the gate green for every later
  tier-3 PR, including ones nobody verified.
- **Fix:** require a report whose filename contains `pr${PR_NUMBER}`, or whose
  body names the head SHA.
- **Agent tier:** Sonnet.

### Unauthenticated `POST /api/alerts/slack` (pre-existing, not in this PR)

- There is no session check and no rate limit. If `LUMEN_SLACK_WEBHOOK_URL`
  is ever set, anyone can drive posts into that Slack channel. It is unset
  today.
- **Fix:** add the same cookie filter as the status route, plus a per-IP rate
  limit, or keep the webhook permanently unset in the demo.
- **Agent tier:** Sonnet.

### A cross-tab read-modify-write can lose an update (per-visitor only)

- Two tabs that each ran `writeOverlay`'s read-modify-write pattern 100 times
  kept 107 of 200 keys. Real simultaneous clicks on two anomalies kept both
  (X-3). A loss needs sub-millisecond interleaving across tabs of one browser,
  and it only costs that visitor a triage click.
- **Fix:** acceptable as is. If anyone cares, wrap the write in
  `navigator.locks.request`.
- **Agent tier:** Haiku.

### Minor, not blocking

- **Empty cookie value passes the status route.** `lumen_demo_session=` (an
  empty value) gets the 200 deprecated response. This is harmless (the route
  never writes), but the "401 without the cookie" wording covers presence
  only. **Agent tier:** none needed, or Haiku to note it in the comment.
- **Panel refetch on every triage click.** The panel refetches its detail and
  flashes the skeleton once per triage click, because an inline `onClose` sits
  in the effect's deps. This predates the PR (router.refresh did the same).
  **Fix:** wrap `onClose` in `useCallback` in the three parents, or hold it in
  a ref. **Agent tier:** Haiku.
- **Stale repo assertions and comments.** None of these block, and none were
  introduced by this PR except the Dockerfile comment, which it made stale:
  - `verify/assertions/home.yml` expects "A demo product by Paradigm Coding
    Solutions", but the footer says "Built by Paradigm Coding Solutions";
  - `verify/assertions/anomaly-detail.yml` expects 200 for
    `/api/anomalies/1`, while `smoke.yml` expects 404 for the same URL;
  - the `tier_map.yml` `anomaly-detail-panel` reason still describes
    `POST /api/anomalies/[id]/status` as the triage path;
  - the Dockerfile header still says "runtime writes (anomaly triage status)
    land in the container layer".

  **Agent tier:** Haiku.
- **Blank status for truthy non-object entries.** Such overlay entries render
  a blank status cell and drop out of the active count. This does not crash.
  B2's validation fixes it too.

### Coverage gaps (stated so the result is not overclaimed)

- Layer 5 (headed Chrome) was not run, by instruction. The adversarial
  generator was not run. Coverage is Chromium only. axe was skipped. HSTS is
  not observable at the local origin.
- A valid-token portal handoff was not exercised. A well-formed JWT would
  make the container fetch the live portal JWKS, and the PR changes none of
  the handoff files. Handoff was covered as bad JSON 400, a malformed token
  401, a missing token 401, and fragment scrubbing with a quiet failure.
- Chart markers on the overview and metric charts were verified by code read
  (they take the same `useTriageOverlayList` output as the lists), not by
  inspecting the SVG.
- The `npm ci` layer came from the build cache. The PR changes no package
  files.
- Whether `main` gets rebuilt and redeployed after merge is out of scope.

## 6. Run artifacts

Run dir (scratch, not in the repo):
`C:\Users\Drama\AppData\Local\Temp\claude\C--dev\c411ea0d-b7a5-4294-9c55-34d74f91e960\scratchpad\verify-runs\pr35-deep\`.

It contains:
- `build.log` (0 token strings);
- `l1-test.log`, `l1-tsc.log` and `l1-lint.log`;
- `dbq.mjs`, plus `a-hash-0.json`, `a-hash-1.json` and `a-hash-2.json`;
- `sweep.mjs`, `sweep.log` and `ids.json`;
- `seedguard.log`;
- `headless.mjs` and `headless.log`;
- `followup.mjs`, `followup.log` and `crash-assigneeName-object.png`;
- `assertions.mjs` and `assertions.log`;
- `details.jsonl`;
- `container-logs/dvl35-a.log` and `container-logs/dvl35-seed.log` (0 env
  values present).
