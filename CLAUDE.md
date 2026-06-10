# lumen-analytics -- project-local instructions

## What this is

Demo #2 of the Paradigm portfolio demos: Lumen Analytics, a fictional
B2B SaaS revenue/behavior analytics product with first-class anomaly
detection. Deploys to lumenanalytics.projectnexuscode.org via the
Phase 0 infrastructure module (separate session).

Canonical spec: the Lumen handoff embedded in the dispatching session,
mirrored in `docs/handoffs/`. Cross-session coordination happens in
`C:\dev\DEMOS_RUNNING_HANDOFF_2026-06.md`.

## Status and chunk map

Chunks 2.1-2.13 per the spec. Track progress in `docs/handoffs/`.

- 2.1 scaffold: DONE (Next.js 14, TS, Tailwind, shadcn/ui, brand wiring)
- 2.2 schema + metrics generator: DONE (seeded, tested)
- 2.3+ executive overview, metrics explorer, anomaly backend, etc.: TODO

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
  `npm run seed`. Generator changes must keep tests green
  (`npm run test`) -- they pin the anomaly story the UI depends on.

## Verify before claiming done

```powershell
npm run verify   # typecheck + vitest + lint
npm run build
```

## Pointers

- Design decisions: `docs/demos/lumen/decisions.md`
- Metric catalog: `src/lib/data/catalog.ts`
- Scripted anomalies: `src/lib/data/anomaly-windows.ts`
- Seed: `scripts/seed.ts` (seed 20260610, `npm run seed`)
- Paradigm palette source: `C:\dev\PARADIGM_PLAN.md` Section 3
