import "server-only";
import {
  METRIC_BY_ID,
  METRICS,
  SEGMENT_DIMENSIONS,
  type MetricCategory,
  type MetricDef,
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
