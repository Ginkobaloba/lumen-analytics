# Lumen Analytics: design decisions

One entry per decision, newest last. Format: date, decision, why.

## 2026-06-10: Brand values hardcoded pending brand-tokens v1.0.0

`@paradigm/brand-tokens` is still `0.1.0-scaffold` with empty token
slots (S02-S04 unfilled). Lumen pins the palette values from the S02
comments in the package's `dist/tokens.css`, which mirror
PARADIGM_PLAN.md Section 3. Swap to the package preset when v1.0.0
tags. Pinned in `tailwind.config.ts` and `src/app/globals.css`.

## 2026-06-10: Terracotta defined locally as #BE5B41

The spec calls for terracotta on high-severity anomalies and bad
metrics, but the Paradigm palette has no terracotta (closest is Signal
Red #E5544B / #C73C34, which reads as pure error red). Defined
terracotta `#BE5B41` for marker fills and `#A84A33` as the darkened
AA-contrast text variant on white. If AxlePoint lands a different
terracotta, adopt theirs (coordinate via the demos running handoff).

## 2026-06-10: Warm off-white = Bone #F4F5F4, cards on Paper

"Warm off-white background" maps to the existing palette rather than a
new cream tone: Bone (#F4F5F4) for the app background, Paper (#FFFFFF)
for cards and chart surfaces. Keeps Lumen inside the Paradigm palette
while reading clearly lighter than the dark-default Paradigm site.
Light theme only; no dark mode by design.

## 2026-06-10: Sliced metrics generated at segment-cell level

Sliced metrics are generated per (plan tier x geography x industry)
cell, then aggregated to the top line and to each one-dimensional
slice. Consequences:

- every dimension's slices sum to the same top-level number,
- KPI cards match the customer list (MRR and active-customer cells are
  anchored to the actual generated customers), and
- the scripted anomalies are concentrated in real cells
  (Starter+EMEA churn, Enterprise+NA expansion, Growth+Software API
  adoption), so cause attribution finds true signal instead of
  decoration.

## 2026-06-10: Churn and contraction flows weighted by logo count

Initially all revenue flows were sized by cell MRR share, which made
the Starter-concentrated churn spike invisible at the top level
(Starter is ~60% of logos but ~9% of MRR). Churned MRR and contraction
MRR now size cells by active-customer share, which is also the more
realistic model: churn volume follows logo counts. Verified by tests
that pin top-level and slice-level lift during each anomaly window.

## 2026-06-10: Deterministic dataset, db as build artifact

Generator runs from fixed seed 20260610 (mulberry32, per-module child
streams). `data/lumen.db` is gitignored and rebuilt by `npm run seed`;
same seed + same end date = identical dataset, so screenshots and the
interview walkthrough are reproducible. The end date is a parameter
(defaults to today) so the data always reads as current.

## 2026-06-10: shadcn pinned at 2.3.0, CSS vars hold full color values

shadcn latest assumes Tailwind v4; 2.3.0 is the last line that targets
Tailwind v3 (which create-next-app@14 ships). Its registry also emits
oklch values that the generated config wrapped in hsl(), which is
invalid CSS; fixed by storing complete hex values in the CSS variables
and referencing them as `var(--x)` in tailwind.config.ts.

## 2026-09-19: Anomaly triage moved client-side, per visitor (finding M1)

`POST /api/anomalies/[id]/status` needed no session (middleware.ts's
matcher only ever covered `/app/*`) and ran `UPDATE anomalies` on the one
shared SQLite database every visitor reads. Any visitor or scanner could
mark every anomaly "false positive," and every later visitor saw the
demo's headline anomaly story as already dismissed until a redeploy.

Fix, following the anonymous-by-design direction
(`COUNCIL_COMPLIANCE_2026-09-19.md` 1.1/1.2 -- demos store no per-visitor
state server-side): triage (Acknowledge, Assign, Mark as false positive)
now lives entirely in the visitor's browser, in localStorage, merged over
the server-rendered anomaly rows at render time
(`src/lib/triage-overlay.ts`, `src/lib/use-triage-overlay.ts`). The
shared `anomalies` table is seed data only from here on:

- The status route no longer writes to `anomalies`. It still requires
  the demo session cookie (a cheap scanner filter, same gate `/app/*`
  already has) and still 404s for an unknown id, but a valid cookie is
  not a write permit either -- it just returns a deprecated-endpoint
  response.
- `runDetection` snapshots the seed/detector's workflow state into a new
  `anomalies_seed_snapshot` table. `openDb()` diffs `anomalies` against
  that snapshot on the process's first connection and restores drift in
  `status` and `assigned_to` only (not other columns, and not row
  inserts or deletes). This is defense-in-depth against direct tampering
  with the SQLite file, not a running-container repair: the deployed
  container mounts no volume, so its database is always freshly seeded
  at image build and can't actually carry drift from before this fix.
- `src/lib/anomaly-actions.ts` (the server-side DB writer) is deleted.

One visitor's triage is never visible to another visitor or a fresh
client; a cleared localStorage (or a different browser) always reads the
seed story. Tests: `tests/triage-overlay.test.ts` (visitor isolation,
forward-only transitions, SSR no-op, corrupt-storage safety),
`tests/anomaly-status-route.test.ts` (cookie gate, shared row never
mutates), `tests/anomaly-seed-guard.test.ts` (snapshot + restore-on-
restart).

### 2026-09-19 follow-up: two deep-verify blockers fixed (B1, B2)

Independent deep verify of PR #35
(`verify/reports/DEEP_VERIFY_2026-09-19_pr35-per-visitor-triage.md`)
found the shared-state fix above held under 10,106 requests and all UI
triage, but failed two claims:

- **B1: "forward-only" was false.** `computeNextTriageState` set
  `acknowledged` unconditionally, so clicking Acknowledge moved a
  `false_positive` or `resolved` anomaly back to `acknowledged` -- this
  exactly mirrored the deleted server code, which was never actually
  forward-only either, despite the docstring's claim. Fixed: acknowledge
  now only advances `active` to `acknowledged` and is a no-op on every
  other status; the Acknowledge button is disabled unless the anomaly is
  `active`. Full transition table pinned in
  `tests/triage-overlay.test.ts`.
- **B2: a wrong-schema overlay entry crashed the anomaly log.** An entry
  whose `assigneeName` was an object reached a rendered prop and threw
  React error #31 on `/app/anomalies` (table and panel), surviving
  reloads. Fixed: every overlay entry is now validated field by field on
  read (`status` one of the four known values, `assignedTo` and
  `assigneeName` string-or-null, `updatedAt` a string); an entry that
  fails is dropped, and the anomaly it named just renders as its server
  (seed) row. Extra unrecognized keys on an otherwise-valid entry are
  tolerated.

Also corrected: the seed-guard comments (schema.sql, db/index.ts,
run-detection.ts) and the Dockerfile header overstated the guard as
recovering an already-running container's mutated state; the deployed
container mounts no volume, so that scenario can't reach the new code.
The guard is defense-in-depth against direct DB tampering, and only
`status`/`assigned_to` (not other columns, inserts, or deletes).

## 2026-09-19: Real signed demo session; per-client Slack alert limit (L1, L4, W8)

**L1, the demo session gate was decorative.** `src/middleware.ts` only
checked that a `lumen_demo_session` cookie existed, `/api/session` set it
to the literal `demo-user`, and `verifyLumenSession` was only ever called
from a test. Any cookie value opened `/app`, `POST /api/alerts/slack` and
`POST /api/anomalies/[id]/status`. Fix:

- One session format for both sign-in paths (`src/lib/portal-session.ts`,
  Edge-safe): an HS256 JWT signed with `SESSION_SECRET`, carrying `jti`
  (random UUID per mint), `iat`, `exp` (1h TTL, cookie `expires` matches),
  `iss=lumen-analytics`, `aud=lumen-session`, `sub`, and
  `src` (`demo` or `portal`). `/api/session` mints the demo one;
  `/api/portal/handoff` still mints its own after verifying the portal
  token. The demo session went from a 24h cookie to 1h, matching the
  portal path; an idle visitor just clicks Sign in again.
- Verification pins `alg` to HS256 and requires `sub`, `jti`, `iat`, `exp`,
  the issuer and audience, a known `src`, and a token age within the TTL.
  That rejects forged (other key), tampered, expired, alg-none, HS512,
  jti-less and the old unsigned `demo-user` values.
- `middleware.ts` verifies with jose in the Edge runtime and redirects
  (clearing the bad cookie) on any failure. `/api/alerts/slack` and the
  anomalies status route use `readRequestSession`: validity, not presence.
- Fail closed, matching the handoff's existing behavior: with
  `SESSION_SECRET` missing or under 32 characters nothing mints (sign-in
  and handoff answer 500 `misconfigured`), nothing verifies (`/app`
  redirects), and the session-required API routes answer 500
  `misconfigured` rather than a 401 that would hide an operator error.
  **Deploy consequence:** sign-in used to work with no secret at all; now
  the deploy env must carry `SESSION_SECRET` or the live demo is locked.
- Not changed: the landing page's "signed in" button state still keys on
  cookie presence. It grants nothing; a stale cookie is cleared by the
  middleware on the first `/app` hit.

**L4, portal handoff replay: not built, blocked on the portal.** The
finding asked for an in-memory used-`jti` set (TTL = token `exp`) for
portal handoff tokens, only if the portal mints a `jti`. It does not:
portal-shell `mintAccessToken` (`src/lib/jwt-signing.ts`, the only mint
path, used by `/api/portal/launch/[slug]`) sets iss, aud, sub, iat, exp,
customer_id, role and portal_role, and no `jti`; the gate contract
doesn't promise one either. So a captured `#portal_token` fragment
replays against `/api/portal/handoff` until its 60-minute `exp`. Keying
the set on a hash of the whole token was considered and left out of this
change: it is a different design than the finding specifies, and the
right fix is one line in the portal (`.setJti(crypto.randomUUID())`),
after which Lumen adds the used-jti set with verification requiring
`jti`.

**W8, the Slack alert limiter was global only.** One anonymous client
could burn everyone's 5-per-minute window. `src/lib/alert-rate-limit.ts`
now enforces two sliding 60s windows:

- global: 5 calls, kept as the ceiling;
- per client: 2 calls, keyed on `CF-Connecting-IP`. Cloudflare sets that
  header on every tunneled request and overwrites a client-supplied one.
  `X-Forwarded-For` and `X-Real-IP` are never read. An absent, empty,
  oversized (over 45 chars) or non-IP value means global limit only.
- A call is recorded in both windows only when both admit it, so a
  client-limited call never burns global budget and vice versa. The
  session check runs first, so unauthenticated calls consume nothing.
- Bounded: expired client entries are pruned on every call, and since
  only admitted calls are recorded, at most 5 keys are live at once.
  A hard cap of 1000 keys with oldest-first eviction is defense in depth.

Known limit: a caller that reaches the container directly (not through
the tunnel) can set `CF-Connecting-IP` freely and rotate it; the global
ceiling is the backstop there, which is the pre-existing behavior.

Tests: `tests/middleware-session.test.ts`, `tests/slack-route.test.ts`,
`tests/alert-rate-limit.test.ts`, `tests/anomaly-status-route.test.ts`,
`tests/portal-handoff.test.ts`, `tests/session-redirect.test.ts`; hostile
cookie fixtures in `tests/helpers/session-tokens.ts`.
