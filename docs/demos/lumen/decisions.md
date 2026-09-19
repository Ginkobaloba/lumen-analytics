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
  that snapshot on the process's first connection and restores any
  drift, which covers an already-running container's SQLite file that
  had mutated rows from before this fix (belt-and-suspenders; nothing
  should ever drift again going forward).
- `src/lib/anomaly-actions.ts` (the server-side DB writer) is deleted.

One visitor's triage is never visible to another visitor or a fresh
client; a cleared localStorage (or a different browser) always reads the
seed story. Tests: `tests/triage-overlay.test.ts` (visitor isolation,
forward-only transitions, SSR no-op, corrupt-storage safety),
`tests/anomaly-status-route.test.ts` (cookie gate, shared row never
mutates), `tests/anomaly-seed-guard.test.ts` (snapshot + restore-on-
restart).
