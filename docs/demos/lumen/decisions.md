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

## 2026-09-19: Node 22 base image

Node 20 is EOL; team standard is Node 22. All three Dockerfile stages
moved from node:20-bookworm-slim to node:22-bookworm-slim.

The apt-get install of python3/make/g++ stays. better-sqlite3@12.10.0
ships a prebuilt binary for node 22 linux-x64 (NODE_MODULE_VERSION 127),
so the toolchain is normally unused: a `docker build` with it removed
completed cleanly and a throwaway container served 200 on `/`. But the
first attempt of that same experiment hit a prebuild-install network
timeout with nothing to fall back to, and failed outright; an unchanged
retry then built cleanly. A build that fails on a flaky network is worse
than a slightly larger builder stage, and the toolchain only lives in
the build stage (never ships in the runtime image), so it was kept as a
fallback: better-sqlite3 normally installs from the prebuild, and
compiles from source only if that download fails or is unavailable.
