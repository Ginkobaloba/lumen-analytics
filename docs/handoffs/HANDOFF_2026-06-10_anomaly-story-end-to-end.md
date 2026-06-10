# HANDOFF 2026-06-10: anomaly story end to end (chunks 2.3, 2.5, 2.6, 2.10)

## What this session did

- Shipped four chunks as squash-merged PRs (#1-#4), main @ 8afcceb,
  32 tests green, tsc + eslint + production build clean throughout.
- **2.3 executive overview (PR #1):** app shell (sidebar/mobile nav,
  Lumen wordmark, Phase 0 Paradigm banner), 5 KPI cards with sparklines
  and PoP deltas, daily MRR trend chart, anomaly feed rail, Live badge.
  Plus `output: standalone`, better-sqlite3 server-external, and the
  Phase 0 Dependabot clean bumps (postcss 8.5.15, glob 10.5.0 override).
- **2.5 detection + attribution backend (PR #2):** rolling-median
  STL-style decomposition (pulse cannot bend its own baseline), MAD
  sigma, |z| > 2.5 flags, episode grouping with gap tolerance, magnitude
  floor, left-edge guard, arr excluded as an mrr duplicate. Attribution
  re-runs decomposition per tier/geo/industry slice and ranks by
  in-window z. Narrative templates produce titles, summaries, suggested
  actions. `npm run detect` rewrites the anomalies table: 27 episodes,
  deterministic; scripted anomalies land high/critical with correct
  windows and slices, December churn event echoes across GRR, logo
  retention, NRR, NPS, first-response time.
- **2.6 drill-down side panel (PR #3):** GET /api/anomalies/[id]
  (expected-vs-actual series + contributor slice series), POST
  .../status (acknowledge / assign / false positive), /api/team. Sheet
  UI with severity badges, shaded episode window, top-3 slices with
  mini charts and contribution shares, suggested steps, action buttons.
  Opens from chart markers and the feed. Verified by interaction in the
  running app, including a persisted Acknowledge.
- **2.10 anomaly log (PR #4):** /app/anomalies table with severity and
  status filters, investigator column, sigma, keyboard-accessible rows
  opening the panel, ?focus deep links. Verified: 27 rows, filter to 2
  criticals, row click opens panel.
- Coordination moved to `C:\dev\DEMOS_RUNNING_HANDOFF.md` (canonical,
  per Phase 0); the two open decisions (logo strip, live-data
  indicator) surfaced there with tradeoffs, both defaulted to the
  spec-recommended yes, veto windows noted.
- `createDb` now resets the database in place when the file is locked
  by a running server (Windows EBUSY), so `npm run seed:full` works
  mid-dev. Dataset build is `npm run seed:full` (seed + detect).

## What is currently broken or incomplete

- Pages not yet built: /app/metrics (+detail), /app/customers
  (+detail), /app/funnels, /app/cohorts, /app/segments,
  /app/integrations, /app/settings. Marketing landing is a placeholder.
- No demo auth yet; AxlePoint's cookie + middleware pattern is the
  template (their repo, demo-axlepoint).
- No Dockerfile yet. Deploy recipe: port 8103, InternalPort 3000,
  `npm run seed:full` at image build, AxlePoint's better-sqlite3 fix
  (python3/make/g++ on node:20-bookworm-slim), then
  `cloudflare-config\scripts\deploy-demo.ps1 -Name lumenanalytics
  -ContextPath C:\dev\lumen-analytics -InternalPort 3000`.
- Tiny-base count metrics read oddly in narratives ("Churned Customers
  spiked 600%"); consider clamping or absolute phrasing in a polish
  pass.
- Next 14 CVE posture is a Tier 3 call with Drew (running handoff,
  Phase 0 triage); 2 npm-audit findings remain, both Next itself.
- Dev note: `next build` while the dev server runs corrupts `.next`;
  restart the dev server afterward (preview config `lumen-dev`, port
  3203, in `C:\dev\.claude\launch.json`).

## What the next session should do first

1. Chunk 2.4 metrics explorer (/app/metrics catalog grid +
   /app/metrics/[id] detail with anomaly markers and explanation panel;
   reuse ExpectedVsActualChart + AnomalyPanel).
2. Chunk 2.7 customers (500-row list, pagination/sort/filter +
   customer detail with ARR history and usage series; tables
   customer_mrr_monthly, customer_usage_daily are already seeded).
3. Then 2.8 funnel, 2.9 cohorts, 2.11 stubs, demo auth, 2.12 landing,
   Dockerfile + deploy, 2.13 /work entry.

## Open questions for Drew

- Logo strip + live-data indicator: defaulted to yes (tradeoffs in the
  running handoff); veto any time before 2.12 ships.
- Next 14 vs 15 posture (Phase 0's Tier 3 item, affects all demos).

## Pointers

- Coordination (canonical): `C:\dev\DEMOS_RUNNING_HANDOFF.md`
- Decisions: `docs/demos/lumen/decisions.md`
- Detection: `src/lib/ml/` (decompose, detect, attribute, narrative,
  run-detection); inspect output with `node scripts/inspect-anomalies.mjs`
- Previous handoff: `HANDOFF_2026-06-10_scaffold-and-data-generator.md`

## Next Session Onboarding

Future sessions: read `C:\dev\SESSION_PROTOCOL.md`, then `CLAUDE.md` in
this project, then this file, then run `vstart` (if it dies with
NativeCommandError after a successful pull, that is the known PS5.1
stderr bug; log the session line manually).
