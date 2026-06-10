import {
  GEOGRAPHIES,
  INDUSTRIES,
  PLAN_TIERS,
  SEGMENT_DIMENSIONS,
  type PlanTier,
  type SegmentDimension,
} from "./catalog";
import { EMBEDDED_ANOMALIES } from "./anomaly-windows";
import type { Customer } from "./customers";
import { dateRange, dayOfWeek } from "./dates";
import { childSeed, mulberry32, normal, type Rng } from "./prng";

export interface MetricRow {
  metric_id: string;
  date: string;
  segment_type: string;
  segment_value: string;
  value: number;
}

export const WINDOW_DAYS = 365;

/* ------------------------------------------------------------------ */
/* Cells: the atomic unit sliced metrics are generated at.             */
/* ------------------------------------------------------------------ */

interface Cell {
  plan_tier: PlanTier;
  geography: string;
  industry: string;
  activeCount: number;
  mrrSum: number;
}

function buildCells(customers: Customer[]): Cell[] {
  const map = new Map<string, Cell>();
  for (const tier of PLAN_TIERS) {
    for (const geo of GEOGRAPHIES) {
      for (const ind of INDUSTRIES) {
        map.set(`${tier}|${geo}|${ind}`, {
          plan_tier: tier,
          geography: geo,
          industry: ind,
          activeCount: 0,
          mrrSum: 0,
        });
      }
    }
  }
  for (const c of customers) {
    if (c.status !== "active") continue;
    const cell = map.get(`${c.plan_tier}|${c.geography}|${c.industry}`)!;
    cell.activeCount += 1;
    cell.mrrSum += c.mrr;
  }
  return [...map.values()];
}

function cellMatches(
  cell: Cell,
  concentration: Partial<Record<SegmentDimension, string>>,
): boolean {
  return Object.entries(concentration).every(
    ([dim, value]) => cell[dim as SegmentDimension] === value,
  );
}

/** Trapezoid anomaly multiplier: 3-day ramp in and out, flat in between. */
function anomalyMultiplier(metricId: string, cell: Cell, day: number): number {
  let mult = 1;
  for (const a of EMBEDDED_ANOMALIES) {
    if (!a.metricIds.includes(metricId)) continue;
    if (day < a.startDay || day > a.endDay) continue;
    if (!cellMatches(cell, a.concentration)) continue;
    const ramp = Math.min(1, (day - a.startDay + 1) / 3, (a.endDay - day + 1) / 3);
    mult *= 1 + (a.multiplier - 1) * ramp;
  }
  return mult;
}

/* ------------------------------------------------------------------ */
/* Series shaping helpers                                              */
/* ------------------------------------------------------------------ */

/** Exponential growth ending at 1.0 on the final day. */
function growthCurve(day: number, totalGrowth: number): number {
  return totalGrowth ** (day / (WINDOW_DAYS - 1)) / totalGrowth;
}

const WEEKDAY_FLAT = [1, 1, 1, 1, 1, 1, 1];
const WEEKDAY_BUSINESS = [0.45, 1.12, 1.18, 1.16, 1.12, 0.97, 0.5]; // Sun..Sat

function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) {
    return Math.max(0, Math.round(normal(rng, lambda, Math.sqrt(lambda))));
  }
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

/* ------------------------------------------------------------------ */
/* Sliced metric configs                                               */
/* ------------------------------------------------------------------ */

type SlicedKind = "level" | "flow" | "count" | "rate";

interface SlicedConfig {
  id: string;
  kind: SlicedKind;
  /** Top-level value on the final day (levels/flows) or daily event total
      (counts). Rates use tierBase instead. */
  scale?: number;
  /** For "level" metrics: scale cells by their actual MRR sum so the KPI
      matches the customer list. */
  fromCellMrr?: boolean;
  /** How flow cells are sized: by revenue share (default) or logo count.
      Churn and contraction follow logo counts; a Starter-heavy churn spike
      must move the top line even though Starter revenue share is small. */
  weightBy?: "mrr" | "count";
  totalGrowth: number;
  weekday: readonly number[];
  noise: number;
  tierBase?: Record<PlanTier, number>;
  decimals: number;
}

const SLICED_CONFIGS: SlicedConfig[] = [
  { id: "mrr", kind: "level", fromCellMrr: true, totalGrowth: 1.21, weekday: WEEKDAY_FLAT, noise: 0.006, decimals: 0 },
  { id: "new_mrr", kind: "flow", scale: 2400, totalGrowth: 1.3, weekday: WEEKDAY_BUSINESS, noise: 0.38, decimals: 0 },
  { id: "expansion_mrr", kind: "flow", scale: 1500, totalGrowth: 1.35, weekday: WEEKDAY_BUSINESS, noise: 0.42, decimals: 0 },
  { id: "contraction_mrr", kind: "flow", scale: 420, totalGrowth: 1.05, weekday: WEEKDAY_BUSINESS, noise: 0.5, decimals: 0, weightBy: "count" },
  { id: "churned_mrr", kind: "flow", scale: 760, totalGrowth: 1.02, weekday: WEEKDAY_BUSINESS, noise: 0.45, decimals: 0, weightBy: "count" },
  { id: "active_customers", kind: "level", totalGrowth: 1.17, weekday: WEEKDAY_FLAT, noise: 0.004, decimals: 0 },
  { id: "new_customers", kind: "count", scale: 1.6, totalGrowth: 1.3, weekday: WEEKDAY_BUSINESS, noise: 0, decimals: 0 },
  { id: "churned_customers", kind: "count", scale: 0.9, totalGrowth: 1.0, weekday: WEEKDAY_BUSINESS, noise: 0, decimals: 0 },
  {
    id: "churn_rate", kind: "rate", totalGrowth: 0.94, weekday: WEEKDAY_FLAT, noise: 0.1, decimals: 2,
    tierBase: { Starter: 4.6, Growth: 2.4, Enterprise: 1.1 },
  },
  { id: "signups", kind: "count", scale: 26, totalGrowth: 1.4, weekday: WEEKDAY_BUSINESS, noise: 0, decimals: 0 },
  { id: "activations", kind: "count", scale: 14, totalGrowth: 1.42, weekday: WEEKDAY_BUSINESS, noise: 0, decimals: 0 },
  { id: "dau", kind: "flow", scale: 5200, totalGrowth: 1.28, weekday: WEEKDAY_BUSINESS, noise: 0.06, decimals: 0 },
  {
    id: "feature_adoption_api", kind: "rate", totalGrowth: 1.12, weekday: WEEKDAY_FLAT, noise: 0.035, decimals: 2,
    tierBase: { Starter: 24, Growth: 56, Enterprise: 71 },
  },
  { id: "support_tickets", kind: "count", scale: 19, totalGrowth: 1.12, weekday: WEEKDAY_BUSINESS, noise: 0, decimals: 0 },
];

/* ------------------------------------------------------------------ */
/* Simple (non-sliced) metric configs                                  */
/* ------------------------------------------------------------------ */

interface SimpleWindow {
  startDay: number;
  endDay: number;
  multiplier: number;
}

interface SimpleConfig {
  id: string;
  base: number;
  totalGrowth: number;
  weekday: readonly number[];
  noise: number;
  decimals: number;
  /** Mild echoes of the embedded anomalies so the dataset reads causally
      coherent (churn spike pressures NRR, support response, CSAT). */
  windows?: SimpleWindow[];
}

const M7 = { startDay: 186, endDay: 204 };
const M9 = { startDay: 247, endDay: 261 };

const SIMPLE_CONFIGS: SimpleConfig[] = [
  { id: "nrr", base: 108, totalGrowth: 1.02, weekday: WEEKDAY_FLAT, noise: 0.006, decimals: 1, windows: [{ ...M7, multiplier: 0.955 }, { ...M9, multiplier: 1.035 }] },
  { id: "grr", base: 93, totalGrowth: 1.01, weekday: WEEKDAY_FLAT, noise: 0.005, decimals: 1, windows: [{ ...M7, multiplier: 0.96 }] },
  { id: "logo_retention", base: 91, totalGrowth: 1.01, weekday: WEEKDAY_FLAT, noise: 0.004, decimals: 1, windows: [{ ...M7, multiplier: 0.975 }] },
  { id: "trials_started", base: 16, totalGrowth: 1.35, weekday: WEEKDAY_BUSINESS, noise: 0.3, decimals: 0 },
  { id: "signup_to_active_rate", base: 38, totalGrowth: 1.1, weekday: WEEKDAY_FLAT, noise: 0.05, decimals: 1 },
  { id: "trial_to_paid_rate", base: 21, totalGrowth: 1.08, weekday: WEEKDAY_FLAT, noise: 0.06, decimals: 1 },
  { id: "avg_session_minutes", base: 14.5, totalGrowth: 1.12, weekday: WEEKDAY_FLAT, noise: 0.07, decimals: 1 },
  { id: "feature_adoption_dashboards", base: 78, totalGrowth: 1.05, weekday: WEEKDAY_FLAT, noise: 0.02, decimals: 1 },
  { id: "feature_adoption_alerts", base: 44, totalGrowth: 1.18, weekday: WEEKDAY_FLAT, noise: 0.03, decimals: 1 },
  { id: "feature_adoption_reports", base: 52, totalGrowth: 1.1, weekday: WEEKDAY_FLAT, noise: 0.025, decimals: 1 },
  { id: "first_response_hours", base: 3.1, totalGrowth: 0.88, weekday: WEEKDAY_FLAT, noise: 0.12, decimals: 1, windows: [{ ...M7, multiplier: 1.45 }] },
  { id: "csat", base: 4.4, totalGrowth: 1.02, weekday: WEEKDAY_FLAT, noise: 0.02, decimals: 2, windows: [{ ...M7, multiplier: 0.94 }] },
  { id: "nps", base: 46, totalGrowth: 1.08, weekday: WEEKDAY_FLAT, noise: 0.04, decimals: 0, windows: [{ ...M7, multiplier: 0.88 }] },
];

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export function generateMetrics(
  seed: number,
  endDate: string,
  customers: Customer[],
): MetricRow[] {
  const dates = dateRange(endDate, WINDOW_DAYS);
  const cells = buildCells(customers);
  const totalActive = cells.reduce((a, c) => a + c.activeCount, 0);
  const totalMrr = cells.reduce((a, c) => a + c.mrrSum, 0);
  const rows: MetricRow[] = [];

  // Deterministic per-cell jitter so cells differ in character, not just size.
  const cellJitter = new Map<string, number>();
  for (const cell of cells) {
    const r = mulberry32(
      childSeed(seed, `jitter|${cell.plan_tier}|${cell.geography}|${cell.industry}`),
    );
    cellJitter.set(`${cell.plan_tier}|${cell.geography}|${cell.industry}`, 0.85 + r() * 0.3);
  }

  for (const cfg of SLICED_CONFIGS) {
    const rng = mulberry32(childSeed(seed, `metric|${cfg.id}`));

    for (let day = 0; day < WINDOW_DAYS; day++) {
      const date = dates[day];
      const wk = cfg.weekday[dayOfWeek(date)];
      const growth = growthCurve(day, cfg.totalGrowth);

      const cellValues: number[] = [];
      for (const cell of cells) {
        const jitter = cellJitter.get(
          `${cell.plan_tier}|${cell.geography}|${cell.industry}`,
        )!;
        const anomaly = anomalyMultiplier(cfg.id, cell, day);
        let v: number;

        if (cfg.kind === "rate") {
          const base = cfg.tierBase![cell.plan_tier] * jitter;
          v = base * growth * anomaly * (1 + normal(rng, 0, cfg.noise));
          v = Math.max(0, round(v, cfg.decimals));
        } else if (cfg.kind === "count") {
          const share = totalActive === 0 ? 0 : cell.activeCount / totalActive;
          const lambda = cfg.scale! * share * jitter * wk * growth * anomaly;
          v = poisson(rng, lambda);
        } else {
          // level / flow: cells sized by revenue or logo share, with level
          // metrics anchored to the real cell totals.
          const share =
            cfg.weightBy === "count"
              ? totalActive === 0
                ? 0
                : cell.activeCount / totalActive
              : totalMrr === 0
                ? 0
                : cell.mrrSum / totalMrr;
          const baseCell =
            cfg.id === "active_customers"
              ? cell.activeCount
              : cfg.fromCellMrr
                ? cell.mrrSum
                : cfg.scale! * share * jitter;
          v = baseCell * wk * growth * anomaly * (1 + normal(rng, 0, cfg.noise));
          v = Math.max(0, round(v, cfg.decimals));
        }
        cellValues.push(v);
      }

      // Aggregate cells to the top level and to each dimension's slices.
      const isRate = cfg.kind === "rate";
      const weights = cells.map((c) => c.activeCount);

      const aggregate = (indices: number[]): number => {
        if (isRate) {
          let num = 0;
          let den = 0;
          for (const i of indices) {
            num += cellValues[i] * weights[i];
            den += weights[i];
          }
          return den === 0 ? 0 : round(num / den, cfg.decimals);
        }
        let sum = 0;
        for (const i of indices) sum += cellValues[i];
        return round(sum, cfg.decimals);
      };

      const allIdx = cells.map((_, i) => i);
      rows.push({
        metric_id: cfg.id,
        date,
        segment_type: "all",
        segment_value: "all",
        value: aggregate(allIdx),
      });

      for (const [dim, values] of Object.entries(SEGMENT_DIMENSIONS)) {
        for (const value of values) {
          const idx = allIdx.filter(
            (i) => cells[i][dim as SegmentDimension] === value,
          );
          rows.push({
            metric_id: cfg.id,
            date,
            segment_type: dim,
            segment_value: value,
            value: aggregate(idx),
          });
        }
      }
    }
  }

  for (const cfg of SIMPLE_CONFIGS) {
    const rng = mulberry32(childSeed(seed, `metric|${cfg.id}`));
    for (let day = 0; day < WINDOW_DAYS; day++) {
      const date = dates[day];
      let v =
        cfg.base *
        growthCurve(day, cfg.totalGrowth) *
        cfg.weekday[dayOfWeek(date)] *
        (1 + normal(rng, 0, cfg.noise));
      for (const w of cfg.windows ?? []) {
        if (day >= w.startDay && day <= w.endDay) {
          const ramp = Math.min(1, (day - w.startDay + 1) / 3, (w.endDay - day + 1) / 3);
          v *= 1 + (w.multiplier - 1) * ramp;
        }
      }
      rows.push({
        metric_id: cfg.id,
        date,
        segment_type: "all",
        segment_value: "all",
        value: Math.max(0, round(v, cfg.decimals)),
      });
    }
  }

  appendDerivedMetrics(rows, dates);
  return rows;
}

/** arr, arpa, wau, mau, dau_mau_ratio are functions of generated series. */
function appendDerivedMetrics(rows: MetricRow[], dates: string[]): void {
  const top = (id: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.metric_id === id && r.segment_type === "all") m.set(r.date, r.value);
    }
    return m;
  };

  const mrr = top("mrr");
  const active = top("active_customers");
  const dau = top("dau");
  const dauSeries = dates.map((d) => dau.get(d) ?? 0);

  const rollingMean = (i: number, win: number): number => {
    const start = Math.max(0, i - win + 1);
    let s = 0;
    for (let j = start; j <= i; j++) s += dauSeries[j];
    return s / (i - start + 1);
  };

  dates.forEach((date, i) => {
    const mrrV = mrr.get(date) ?? 0;
    const activeV = active.get(date) ?? 1;
    const wau = Math.round(rollingMean(i, 7) * 2.15);
    const mau = Math.round(rollingMean(i, 30) * 4.05);
    const push = (metric_id: string, value: number) =>
      rows.push({ metric_id, date, segment_type: "all", segment_value: "all", value });

    push("arr", mrrV * 12);
    push("arpa", round(activeV === 0 ? 0 : mrrV / activeV, 0));
    push("wau", wau);
    push("mau", mau);
    push("dau_mau_ratio", round(mau === 0 ? 0 : (dauSeries[i] / mau) * 100, 1));
  });
}
