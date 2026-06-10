import "server-only";
import { METRIC_BY_ID, type MetricDef } from "./data/catalog";
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
