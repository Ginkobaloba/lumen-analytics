# lumen-analytics -- project-local instructions

## What this is

Demo #2 of the Paradigm portfolio demos: Lumen Analytics, a fictional
B2B SaaS revenue/behavior analytics product with first-class anomaly
detection. Deploys to lumenanalytics.projectnexuscode.org via the
Phase 0 infrastructure module (separate session).

Canonical spec: the Lumen handoff embedded in the dispatching session,
mirrored in `docs/handoffs/`. Cross-session coordination happens in
`C:\dev\DEMOS_RUNNING_HANDOFF.md` (canonical per Phase 0; the older
`DEMOS_RUNNING_HANDOFF_2026-06.md` holds session-1 detail).

## Status and chunk map

Chunks 2.1-2.13 per the spec. Track progress in `docs/handoffs/`.

- 2.1 scaffold: DONE (Next.js 14, TS, Tailwind, shadcn/ui, brand wiring)
- 2.2 schema + metrics generator: DONE (seeded, tested)
- 2.3 executive overview: DONE (PR #1; app shell, KPI cards, MRR trend,
  anomaly feed, Phase 0 banner)
- 2.5 anomaly detection + cause attribution backend: DONE (rolling-median
  STL-style decomposition, episode grouping, per-slice attribution,
  narrative generation; `npm run detect`, tested)
- 2.6 anomaly drill-down side panel: DONE (PR #3; detail + status APIs,
  expected-vs-actual charts, contributor mini charts, triage actions)
- 2.10 anomaly log: DONE (PR #4; filters, deep links, opens the panel)
- 2.4 metrics explorer: DONE (PR #5; catalog grid by category, metric
  detail with anomaly markers opening the panel, segment-slice toggle)
- 2.7 customers: DONE (PR #6; 500-row table with search/filter/sort/
  pagination, account detail with MRR history, usage charts, activity)
- 2.8 funnel Sankey: DONE (PR #7; d3-sankey acquisition funnel with
  drop-off sinks, 30/90/365-day toggle, stage stat cards)
- 2.9 cohort heatmap: DONE (PR #8; NRR + logo retention triangle by
  signup cohort, brand color ramp, also esbuild/postcss override bumps)
- 2.11 stubs: DONE (PR #9; segments with live counts, integrations
  catalog, settings with team + read-only toggles)
- demo auth: DONE (PR #10; AxlePoint cookie + middleware pattern,
  lumen_demo_session gating /app, one-click sign-in/out)
- 2.12 marketing landing: DONE (PR #11; hero with SVG anomaly visual,
  fictional logo strip with microcaption, features, CTA, banner)
- Dockerfile + deploy: DONE (PR #12). LIVE at
  https://lumenanalytics.projectnexuscode.org (port 8103, DREWSPC only,
  BROOKFIELD pending the ssh icacls fix). Redeploy refreshes the data
  window: `cloudflare-config\scripts\deploy-demo.ps1 -Name
  lumenanalytics -ContextPath C:\dev\lumen-analytics -InternalPort 3000
  -VerifyContent "Lumen"`.
- 2.14 must-have polish: DONE (anomaly -> segment -> account drill-through,
  functional Slack webhook alerting, visible triage persistence). The
  anomaly panel resolves contributing slices to the real account list
  (`src/lib/affected-accounts.ts`); /app/customers takes deep-link filters
  (tier/geo/industry/status/q + `anomaly` banner); `POST /api/alerts/slack`
  forwards a Block Kit payload to LUMEN_SLACK_WEBHOOK_URL (live when set,
  payload-returning no-op when not). updated_at is surfaced in the panel.
- Remaining: 2.13 Work page entry, requested from the paradigm-site
  copy session (their PR #31/#33 pattern) via the running handoff.

## Hard rules

- Git from Windows PowerShell only (SESSION_PROTOCOL.md Section 7).
- No em dashes anywhere, including generated marketing copy.
- Light theme only: warm off-white (Bone #F4F5F4) background, Paper
  cards. No dark-mode aesthetic.
- Muted gold (#D9A441) is reserved for moderate anomalies and warnings;
  terracotta (#BE5B41) for high-severity anomalies and bad deltas;
  forest green for good metrics; gray for neutral.
- Brand values are hardcoded pending @paradigm/brand-tokens v1.0.0
  (still 0.1.0-scaffold with empty slots). Swap when it ships.
- The SQLite db is a build artifact: never commit it, always
  `npm run seed:full` (seed + detect). Generator or detector changes must
  keep tests green (`npm run test`) -- they pin the anomaly story the UI
  depends on (windows, slices, severities, statuses).

## Verify before claiming done

```powershell
npm run verify   # typecheck + vitest + lint
npm run build
```

## Pointers

- Design decisions: `docs/demos/lumen/decisions.md`
- Metric catalog: `src/lib/data/catalog.ts`
- Scripted anomalies: `src/lib/data/anomaly-windows.ts`
- Anomaly -> account drill-through: `src/lib/affected-accounts.ts`
- Slack alerting: `src/lib/alerting.ts`, `src/app/api/alerts/slack/route.ts`
  (set `LUMEN_SLACK_WEBHOOK_URL` to deliver; see `.env.example`)
- Seed: `scripts/seed.ts` (seed 20260610, `npm run seed`)
- Paradigm palette source: `C:\dev\PARADIGM_PLAN.md` Section 3
