# HANDOFF 2026-06-12: Lumen live (chunks 2.4, 2.7-2.9, 2.11, 2.12, auth, deploy)

## What this session did

- Shipped eight squash-merged PRs (#5-#12), main @ df98cd3, 46 tests
  green and a clean production build at every step, then deployed.
  **https://lumenanalytics.projectnexuscode.org is LIVE** (DREWSPC only,
  BROOKFIELD skipped on the known ssh icacls blocker).
- **2.4 metrics explorer (PR #5):** /app/metrics renders all 32 catalog
  metrics grouped by category with sparklines, deltas, anomaly-count
  chips; /app/metrics/[id] shows the 12-month series with severity
  markers and a per-metric anomaly list, both opening the 2.6 panel;
  segment-slice toggle (plan tier / geography / industry) on the 14
  sliced metrics.
- **2.7 customers (PR #6):** 500-row list with search, tier/geo/status
  filters, sortable columns, 25-row pagination; account detail with
  fact grid, 12-month MRR bars, 90-day usage charts, activity feed.
- **2.8 funnel (PR #7):** d3-sankey acquisition funnel with drop-off
  sinks, conversion labels, 30/90/365-day toggle, stage stat cards.
  New dep: d3-sankey (+types).
- **2.9 cohorts (PR #8):** signup-cohort triangle heatmap, NRR and
  logo retention toggle, brand color ramp with luminance text flips.
  Also took the two new Dependabot clean bumps as overrides (esbuild
  0.28.1, Next's vendored postcss -> 8.5.15).
- **2.11 stubs (PR #9):** segments (live counts from the customers
  table, including the Starter EMEA churn-watch slice), integrations
  catalog, settings with the seeded team.
- **Demo auth (PR #10):** AxlePoint cookie + middleware pattern;
  lumen_demo_session gates /app/:path*, one-click sign-in/out, no
  credentials anywhere.
- **2.12 landing (PR #11):** hero with hand-authored SVG anomaly
  visual, the defaulted Option A logo strip ("Illustrative customers.
  All names fictional."), six features, detect/attribute/act strip,
  CTA into the churn-spike story. Zero em dashes verified in rendered
  output.
- **Dockerfile + deploy (PR #12):** AxlePoint three-stage pattern
  (python3/make/g++ for better-sqlite3, `npm run seed:full` at image
  build so data anchors to the build date, standalone runtime as node
  user). Deployed via `deploy-demo.ps1 -Name lumenanalytics
  -ContextPath C:\dev\lumen-analytics -InternalPort 3000
  -VerifyContent "Lumen"`. Verified live through Cloudflare: landing,
  auth loop (303 + cookie, 307 gate), all app pages 200.
- Coordination kept current in `C:\dev\DEMOS_RUNNING_HANDOFF.md`
  per chunk, including a request to the paradigm-site copy session for
  the 2.13 /work card (their PR #31/#33 pattern, precedent from
  AxlePoint and Slatewell whose cards were both done by that session).

## What is currently broken or incomplete

- 2.13 /work card + case study: requested from the paradigm-site copy
  session in the running handoff; if they don't pick it up, the
  pattern is liveDemos[] entry + work/lumenanalytics.astro + COPY.md
  D.12 appendix + Playwright shot in `C:\dev\_tools\shot`.
- BROOKFIELD replication still blocked on the ssh config icacls fix
  (Drew); single-host deploy is loud about it and otherwise fine.
- Polish-pass candidates (cosmetic, none blocking): decorative events
  from 2.2 are not aligned with customer churned_at dates (a churned
  account can show churn events on other dates); tiny-base count
  metrics read oddly in narratives ("Churned Customers spiked 600%").
- Next 14 CVE posture still a Tier 3 call with Drew (14 open
  Dependabot alerts, all Next itself, no patched 14.x exists).
- Known dev quirks: `next build` while the dev server runs corrupts
  `.next`; preview screenshots hang in hidden windows (recharts rAF),
  HTTP/DOM checks work; PS5.1 NativeCommandError in vstart after a
  successful pull means log the session line manually.

## What the next session should do first

1. Check whether the paradigm-site session shipped the Lumen /work
   card (status table in `C:\dev\DEMOS_RUNNING_HANDOFF.md`); if not,
   do 2.13 in `C:\dev\paradigm-site` per their documented pattern.
2. Optional polish pass: events/churned_at alignment, tiny-base
   narrative phrasing, both noted above. Keep `npm run test` green;
   the 46 tests pin the anomaly story.
3. If Drew picks a Next posture (14 vs 15), act on it; a 15.5.16
   migration would clear the remaining Dependabot alerts.

## Open questions for Drew

- Logo strip + live-data indicator shipped per the defaulted yes;
  veto window is now until the /work card publishes broadly.
- Next 14 vs 15 posture (Tier 3, affects all four demos).
- BROOKFIELD ssh config icacls fix to restore two-host deploys.

## Pointers

- Live: https://lumenanalytics.projectnexuscode.org (port 8103)
- Coordination (canonical): `C:\dev\DEMOS_RUNNING_HANDOFF.md`
- Decisions: `docs/demos/lumen/decisions.md`
- Redeploy (refreshes the data window):
  `cloudflare-config\scripts\deploy-demo.ps1 -Name lumenanalytics
  -ContextPath C:\dev\lumen-analytics -InternalPort 3000
  -VerifyContent "Lumen"`
- Previous handoff: `HANDOFF_2026-06-10_anomaly-story-end-to-end.md`

## Next Session Onboarding

Future sessions: read `C:\dev\SESSION_PROTOCOL.md`, then `CLAUDE.md` in
this project, then this file, then run `vstart` (if it dies with
NativeCommandError after a successful pull, that is the known PS5.1
stderr bug; log the session line manually).
