import "server-only";
import {
  METRIC_BY_ID,
  METRICS,
  SEGMENT_DIMENSIONS,
  type Geography,
  type Industry,
  type MetricCategory,
  type MetricDef,
  type PlanTier,
  type SegmentDimension,
} from "./data/catalog";
import { openDb } from "./db";

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface Kpi {
  metric: MetricDef;
  current: number;
  /** Period-over-period: (last 30d mean / prior 30d mean) - 1. Null when
      the prior period has no signal. */
  delta: number | null;
  spark: SeriesPoint[];
}

export interface AnomalyListItem {
  id: string;
  metric_id: string;
  metric_name: string;
  date: string;
  end_date: string | null;
  direction: "up" | "down";
  severity: "low" | "medium" | "high" | "critical";
  status: "active" | "acknowledged" | "resolved" | "false_positive";
  expected_value: number;
  actual_value: number;
  sigma: number;
  title: string;
  summary: string;
  assigned_to: string | null;
  assignee_name: string | null;
}

export function getTopLevelSeries(metricId: string, days: number): SeriesPoint[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT date, value FROM metrics_daily
       WHERE metric_id = ? AND segment_type = 'all'
       ORDER BY date DESC LIMIT ?`,
    )
    .all(metricId, days) as SeriesPoint[];
  return rows.reverse();
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((a, b) => a + b, 0) / values.length;
}

/** KPI snapshot: latest value, PoP delta on 30-day means, 90-day sparkline. */
export function getKpis(metricIds: string[]): Kpi[] {
  return metricIds.map((id) => {
    const metric = METRIC_BY_ID[id];
    if (!metric) throw new Error(`Unknown metric id: ${id}`);
    const series = getTopLevelSeries(id, 90);
    const values = series.map((p) => p.value);
    const current = values[values.length - 1] ?? 0;
    const last30 = mean(values.slice(-30));
    const prior30 = mean(values.slice(-60, -30));
    return {
      metric,
      current,
      delta: prior30 === 0 ? null : last30 / prior30 - 1,
      spark: series,
    };
  });
}

export function getAllAnomalies(): AnomalyListItem[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS assignee_name
       FROM anomalies a
       LEFT JOIN users u ON u.id = a.assigned_to
       ORDER BY a.date DESC,
         CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                         WHEN 'medium' THEN 2 ELSE 3 END`,
    )
    .all() as AnomalyListItem[];
  return rows.map((r) => ({
    ...r,
    metric_name: METRIC_BY_ID[r.metric_id]?.name ?? r.metric_id,
  }));
}

/** The single most severe anomaly, for the integrations "send test alert"
    action and any single-anomaly demo entry point. */
export function getTopAnomalyId(): string | null {
  const db = openDb();
  const row = db
    .prepare(
      `SELECT id FROM anomalies
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                              WHEN 'medium' THEN 2 ELSE 3 END, sigma DESC
       LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

export function getRecentAnomalies(limit = 8): AnomalyListItem[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS assignee_name
       FROM anomalies a
       LEFT JOIN users u ON u.id = a.assigned_to
       ORDER BY a.date DESC, a.severity DESC
       LIMIT ?`,
    )
    .all(limit) as (AnomalyListItem & { metric_name?: string })[];
  return rows.map((r) => ({
    ...r,
    metric_name: METRIC_BY_ID[r.metric_id]?.name ?? r.metric_id,
  }));
}

/** Anomalies overlapping a metric's series, for chart markers. */
export function getAnomalyMarkers(metricIds: string[]): AnomalyListItem[] {
  if (metricIds.length === 0) return [];
  const db = openDb();
  const placeholders = metricIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT a.*, NULL AS assignee_name FROM anomalies a
       WHERE a.metric_id IN (${placeholders})
       ORDER BY a.date ASC`,
    )
    .all(...metricIds) as AnomalyListItem[];
  return rows.map((r) => ({
    ...r,
    metric_name: METRIC_BY_ID[r.metric_id]?.name ?? r.metric_id,
  }));
}

export interface MetricSummary extends Kpi {
  anomalyCount: number;
}

export interface MetricCategoryGroup {
  category: MetricCategory;
  metrics: MetricSummary[];
}

/** Display order and headings for the metrics explorer. */
export const CATEGORY_LABEL: Record<MetricCategory, string> = {
  revenue: "Revenue",
  customers: "Customers",
  conversion: "Conversion",
  engagement: "Engagement",
  support: "Support",
};

/** Full catalog snapshot for /app/metrics, grouped by category in
    catalog order. */
export function getMetricsExplorerData(): MetricCategoryGroup[] {
  const db = openDb();
  const counts = new Map(
    (
      db
        .prepare(`SELECT metric_id, COUNT(*) AS n FROM anomalies GROUP BY metric_id`)
        .all() as { metric_id: string; n: number }[]
    ).map((r) => [r.metric_id, r.n]),
  );
  const kpis = getKpis(METRICS.map((m) => m.id));

  const groups: MetricCategoryGroup[] = [];
  for (const kpi of kpis) {
    const summary: MetricSummary = {
      ...kpi,
      anomalyCount: counts.get(kpi.metric.id) ?? 0,
    };
    const group = groups.find((g) => g.category === kpi.metric.category);
    if (group) group.metrics.push(summary);
    else groups.push({ category: kpi.metric.category, metrics: [summary] });
  }
  return groups;
}

export interface SliceSeries {
  value: string;
  series: SeriesPoint[];
}

export interface MetricSliceDimension {
  dimension: SegmentDimension;
  slices: SliceSeries[];
}

export interface MetricDetailData {
  metric: MetricDef;
  series: SeriesPoint[];
  anomalies: AnomalyListItem[];
  /** Per-dimension slice series; empty for unsliced metrics. */
  dimensions: MetricSliceDimension[];
  current: number;
  delta: number | null;
  asOf: string;
}

/** Everything /app/metrics/[id] needs; null for unknown metric ids. */
export function getMetricDetail(metricId: string): MetricDetailData | null {
  const metric = METRIC_BY_ID[metricId];
  if (!metric) return null;

  const db = openDb();
  const series = getTopLevelSeries(metricId, 365);
  const [kpi] = getKpis([metricId]);

  const anomalies = (
    db
      .prepare(
        `SELECT a.*, u.name AS assignee_name
         FROM anomalies a
         LEFT JOIN users u ON u.id = a.assigned_to
         WHERE a.metric_id = ?
         ORDER BY a.date DESC`,
      )
      .all(metricId) as AnomalyListItem[]
  ).map((r) => ({ ...r, metric_name: metric.name }));

  const dimensions: MetricSliceDimension[] = [];
  if (metric.sliced && series.length > 0) {
    const fromDate = series[0].date;
    const sliceStmt = db.prepare(
      `SELECT segment_value, date, value FROM metrics_daily
       WHERE metric_id = ? AND segment_type = ? AND date >= ?
       ORDER BY date ASC`,
    );
    for (const [dimension, values] of Object.entries(SEGMENT_DIMENSIONS)) {
      const rows = sliceStmt.all(metricId, dimension, fromDate) as {
        segment_value: string;
        date: string;
        value: number;
      }[];
      const byValue = new Map<string, SeriesPoint[]>();
      for (const row of rows) {
        let points = byValue.get(row.segment_value);
        if (!points) byValue.set(row.segment_value, (points = []));
        points.push({ date: row.date, value: row.value });
      }
      dimensions.push({
        dimension: dimension as SegmentDimension,
        // Catalog order, not insertion order, so legends are stable.
        slices: values
          .filter((v) => byValue.has(v))
          .map((v) => ({ value: v, series: byValue.get(v)! })),
      });
    }
  }

  return {
    metric,
    series,
    anomalies,
    dimensions,
    current: kpi.current,
    delta: kpi.delta,
    asOf: series[series.length - 1]?.date ?? "",
  };
}

export interface CustomerListItem {
  id: string;
  name: string;
  domain: string;
  plan_tier: PlanTier;
  geography: Geography;
  industry: Industry;
  signup_date: string;
  status: "active" | "churned";
  mrr: number;
  seats: number;
  churn_risk: number;
  expansion_score: number;
  owner_name: string;
}

/** All customers for the /app/customers table; filtering, sorting, and
    paging happen client-side (500 rows). */
export function getCustomersList(): CustomerListItem[] {
  const db = openDb();
  return db
    .prepare(
      `SELECT c.id, c.name, c.domain, c.plan_tier, c.geography, c.industry,
              c.signup_date, c.status, c.mrr, c.seats, c.churn_risk,
              c.expansion_score, u.name AS owner_name
       FROM customers c
       JOIN users u ON u.id = c.owner_user_id
       ORDER BY c.mrr DESC, c.name ASC`,
    )
    .all() as CustomerListItem[];
}

export interface CustomerEvent {
  type: string;
  occurred_at: string;
  properties: Record<string, unknown>;
}

export interface CustomerDetailData {
  customer: CustomerListItem & {
    last_active_date: string | null;
    churned_at: string | null;
  };
  owner: { name: string; role: string; initials: string; color: string };
  mrrHistory: { month: string; mrr: number }[];
  usage: { date: string; active_users: number; api_calls: number }[];
  events: CustomerEvent[];
}

/** Everything /app/customers/[id] needs; null for unknown ids. */
export function getCustomerDetail(customerId: string): CustomerDetailData | null {
  const db = openDb();
  const row = db
    .prepare(
      `SELECT c.*, u.name AS owner_name, u.role AS owner_role,
              u.initials AS owner_initials, u.color AS owner_color
       FROM customers c
       JOIN users u ON u.id = c.owner_user_id
       WHERE c.id = ?`,
    )
    .get(customerId) as
    | (CustomerDetailData["customer"] & {
        owner_role: string;
        owner_initials: string;
        owner_color: string;
      })
    | undefined;
  if (!row) return null;

  const mrrHistory = db
    .prepare(
      `SELECT month, mrr FROM customer_mrr_monthly
       WHERE customer_id = ? ORDER BY month ASC`,
    )
    .all(customerId) as { month: string; mrr: number }[];

  const usage = db
    .prepare(
      `SELECT date, active_users, api_calls FROM customer_usage_daily
       WHERE customer_id = ? ORDER BY date ASC`,
    )
    .all(customerId) as CustomerDetailData["usage"];

  const events = (
    db
      .prepare(
        `SELECT type, occurred_at, properties FROM events
         WHERE customer_id = ? ORDER BY occurred_at DESC LIMIT 12`,
      )
      .all(customerId) as { type: string; occurred_at: string; properties: string }[]
  ).map((e) => ({
    type: e.type,
    occurred_at: e.occurred_at,
    properties: JSON.parse(e.properties) as Record<string, unknown>,
  }));

  const { owner_role, owner_initials, owner_color, ...customer } = row;
  return {
    customer,
    owner: {
      name: customer.owner_name,
      role: owner_role,
      initials: owner_initials,
      color: owner_color,
    },
    mrrHistory,
    usage,
    events,
  };
}

export interface FunnelStage {
  id: string;
  label: string;
  count: number;
}

export interface FunnelWindow {
  days: number;
  label: string;
  stages: FunnelStage[];
}

export interface FunnelData {
  windows: FunnelWindow[];
  asOf: string;
}

const FUNNEL_STAGES: { id: string; label: string }[] = [
  { id: "signups", label: "Signups" },
  { id: "trials_started", label: "Trials started" },
  { id: "activations", label: "Activated" },
  { id: "new_customers", label: "Converted to paid" },
];

const FUNNEL_WINDOWS: { days: number; label: string }[] = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

/** Acquisition funnel sums for /app/funnels, one entry per window.
    Stage counts are clamped to be non-increasing so daily noise in the
    generated series can never produce a negative drop-off band. */
export function getFunnelData(): FunnelData {
  const db = openDb();
  const asOf = (
    db
      .prepare(`SELECT MAX(date) AS d FROM metrics_daily WHERE segment_type = 'all'`)
      .get() as { d: string }
  ).d;

  const stmt = db.prepare(
    `SELECT metric_id, SUM(value) AS total FROM metrics_daily
     WHERE segment_type = 'all' AND metric_id IN (${FUNNEL_STAGES.map(() => "?").join(", ")})
       AND date > ?
     GROUP BY metric_id`,
  );

  const windows = FUNNEL_WINDOWS.map(({ days, label }) => {
    const from = new Date(`${asOf}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - days);
    const totals = new Map(
      (
        stmt.all(
          ...FUNNEL_STAGES.map((s) => s.id),
          from.toISOString().slice(0, 10),
        ) as { metric_id: string; total: number }[]
      ).map((r) => [r.metric_id, r.total]),
    );
    let cap = Infinity;
    const stages = FUNNEL_STAGES.map(({ id, label: stageLabel }) => {
      cap = Math.min(cap, Math.round(totals.get(id) ?? 0));
      return { id, label: stageLabel, count: cap };
    });
    return { days, label, stages };
  });

  return { windows, asOf };
}

export interface CohortRow {
  /** Cohort signup month (first-of-month ISO date). */
  month: string;
  size: number;
  baseMrr: number;
  /** Percent per month offset; null outside the triangle. */
  nrr: (number | null)[];
  logo: (number | null)[];
}

export interface CohortData {
  /** The 12 trailing months covered by customer_mrr_monthly. */
  months: string[];
  rows: CohortRow[];
  asOf: string;
}

/** Signup-month cohorts over the trailing 12 months for /app/cohorts:
    net revenue retention (cohort MRR vs month 0) and logo retention
    (share of cohort accounts not yet churned). */
export function getCohortData(): CohortData {
  const db = openDb();
  const months = (
    db
      .prepare(`SELECT DISTINCT month FROM customer_mrr_monthly ORDER BY month ASC`)
      .all() as { month: string }[]
  ).map((r) => r.month);
  if (months.length === 0) return { months: [], rows: [], asOf: "" };

  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const customers = db
    .prepare(
      `SELECT id, signup_date, churned_at FROM customers
       WHERE substr(signup_date, 1, 7) >= substr(?, 1, 7)
       ORDER BY signup_date ASC`,
    )
    .all(months[0]) as { id: string; signup_date: string; churned_at: string | null }[];

  const mrrByCustomerMonth = new Map<string, number>();
  for (const r of db
    .prepare(`SELECT customer_id, month, mrr FROM customer_mrr_monthly`)
    .all() as { customer_id: string; month: string; mrr: number }[]) {
    mrrByCustomerMonth.set(`${r.customer_id}|${r.month}`, r.mrr);
  }

  const byCohort = new Map<string, typeof customers>();
  for (const c of customers) {
    const cohort = `${c.signup_date.slice(0, 7)}-01`;
    if (!monthIndex.has(cohort)) continue;
    let members = byCohort.get(cohort);
    if (!members) byCohort.set(cohort, (members = []));
    members.push(c);
  }

  const rows: CohortRow[] = [...byCohort.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([cohort, members]) => {
      const mi = monthIndex.get(cohort)!;
      const sumMrrAt = (m: string) =>
        members.reduce(
          (s, c) => s + (mrrByCustomerMonth.get(`${c.id}|${m}`) ?? 0),
          0,
        );
      const baseMrr = sumMrrAt(cohort);

      const nrr: (number | null)[] = [];
      const logo: (number | null)[] = [];
      for (let k = 0; k < months.length; k++) {
        const idx = mi + k;
        if (idx >= months.length) {
          nrr.push(null);
          logo.push(null);
          continue;
        }
        const m = months[idx];
        nrr.push(
          baseMrr > 0 ? Number(((sumMrrAt(m) / baseMrr) * 100).toFixed(1)) : null,
        );
        const retained = members.filter(
          (c) => c.churned_at === null || c.churned_at.slice(0, 7) > m.slice(0, 7),
        ).length;
        logo.push(Number(((retained / members.length) * 100).toFixed(1)));
      }

      return { month: cohort, size: members.length, baseMrr, nrr, logo };
    });

  return { months, rows, asOf: months[months.length - 1] };
}

export interface OverviewData {
  kpis: Kpi[];
  revenueTrend: SeriesPoint[];
  revenueMarkers: AnomalyListItem[];
  recentAnomalies: AnomalyListItem[];
  asOf: string;
}

export function getOverviewData(): OverviewData {
  const kpis = getKpis(["mrr", "arr", "nrr", "active_customers", "churn_rate"]);
  const revenueTrend = getTopLevelSeries("mrr", 365);
  return {
    kpis,
    revenueTrend,
    // Revenue-family anomalies render as markers on the trend chart.
    revenueMarkers: getAnomalyMarkers([
      "mrr",
      "new_mrr",
      "expansion_mrr",
      "churned_mrr",
      "contraction_mrr",
    ]),
    recentAnomalies: getRecentAnomalies(8),
    asOf: revenueTrend[revenueTrend.length - 1]?.date ?? "",
  };
}
