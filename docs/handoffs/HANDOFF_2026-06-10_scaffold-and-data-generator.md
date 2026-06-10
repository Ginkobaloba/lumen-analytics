# HANDOFF 2026-06-10: scaffold and data generator (chunks 2.1-2.2)

## What this session did

- Created the project (Next.js 14 App Router, TypeScript, Tailwind v3,
  shadcn/ui 2.3.0 with 16 components) at `C:\dev\lumen-analytics`.
- Wired the Paradigm palette as the Lumen light theme: Bone background,
  Paper cards, Pine/Paradigm Green accent, Amber for moderate anomalies,
  locally defined terracotta #BE5B41 for high severity. Fonts: Space
  Grotesk headings, Inter body, JetBrains Mono, via next/font.
- Built the SQLite schema (`src/lib/db/schema.sql`): users, customers,
  events, metrics_daily (with segment slices), anomalies,
  customer_mrr_monthly, customer_usage_daily.
- Built the deterministic synthetic data generator (`src/lib/data/`):
  500 customers (300/150/50 tiers), 32 metrics x 365 days (14 of them
  sliced by plan tier, geography, industry), 2000 events, 8 team
  members, 12 months of per-customer MRR and 90 days of usage.
- Embedded the three scripted anomalies concentrated in real segment
  cells: month-7 churn spike (Starter+EMEA, x3.0), month-9 expansion
  surge (Enterprise+NA, x2.6), month-11 API adoption drop
  (Growth+Software, x0.4). Slices sum to top line on every dimension;
  final-day MRR and active customers match the customer table.
- 19 vitest tests pin the anomaly story (top-level and slice-level lift,
  control slices flat), distributions, determinism, and seed row counts.
- `npm run seed` builds `data/lumen.db` (~80k metric rows, gitignored).
- Verified: vitest 19/19, tsc clean, eslint clean, `next build` clean.
- Placeholder landing page only; created `DEMOS_RUNNING_HANDOFF_2026-06.md`
  at `C:\dev` for cross-session coordination (AxlePoint, Phase 0).

## What is currently broken or incomplete

- No /app routes yet; landing page is a placeholder (full marketing
  landing is chunk 2.12).
- anomalies table exists but is empty: the detector (chunk 2.5) fills it.
- Brand values are hardcoded pending @paradigm/brand-tokens v1.0.0
  (package is still 0.1.0-scaffold with empty slots).
- No favicon/wordmark assets yet (monogram L in a circle, forest green).
- Demo auth "same pattern as AxlePoint" not started; AxlePoint has not
  landed its pattern yet (check the demos running handoff).

## What the next session should do first

1. Chunk 2.3: executive overview at /app (KPI cards with sparklines and
   PoP deltas, revenue trend chart, anomaly feed rail). Data access via
   `openDb()` in `src/lib/db`; metric catalog in `src/lib/data/catalog.ts`.
2. Then chunk 2.5 (anomaly detection + cause attribution backend) early,
   since 2.3's anomaly markers and feed depend on it. Order within
   2.3-2.6 can flex; the detector unblocks the most UI.
3. Check `C:\dev\DEMOS_RUNNING_HANDOFF_2026-06.md` for AxlePoint
   patterns to adopt (auth, Paradigm banner, brand tokens) and Phase 0
   deploy interface.

## Open questions for Drew

- Fake "Trusted by" logo strip on the landing: recommended yes
  (5-6 plausible fake B2B SaaS logos). Confirm.
- Small "Live data" indicator that gently animates time series:
  recommended yes. Confirm.
- GitHub repo created private (Ginkobaloba/lumen-analytics). Flip to
  public when it is portfolio-ready, or sooner if you want it visible.

## Pointers

- Demo spec: the Lumen handoff from the dispatching session (chunks
  2.1-2.13, success criteria, AI/ML UI spec).
- Coordination: `C:\dev\DEMOS_RUNNING_HANDOFF_2026-06.md`
- Decisions: `docs/demos/lumen/decisions.md`
- Scripted anomalies: `src/lib/data/anomaly-windows.ts`
- Palette source: `C:\dev\PARADIGM_PLAN.md` Section 3

## Next Session Onboarding

Future sessions: read `C:\dev\SESSION_PROTOCOL.md`, then `CLAUDE.md` in
this project, then this file, then run `vstart`.
