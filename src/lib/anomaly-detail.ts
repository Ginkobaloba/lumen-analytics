import "server-only";
import { getAffectedAccounts, type AffectedAccounts } from "./affected-accounts";
import { METRIC_BY_ID, type MetricDef } from "./data/catalog";
import { dayOfWeek } from "./data/dates";
import { openDb } from "./db";
import { decompose } from "./ml/decompose";
import type { Attribution } from "./ml/attribute";

/*
  Detail payload for the anomaly side panel: the anomaly row, an
  expected-vs-actual series around the episode window (expected = trend +
  seasonal from the same decomposition the detector ran), and the same
  view for each top contributing slice.
*/

const CONTEXT_DAYS = 45; // days of context on each side of the episode

export interface ExpectedVsActualSeries {
  dates: string[];
  actual: number[];
  expected: number[];
  /** Episode window bounds, inclusive ISO dates. */
  windowStart: string;
  windowEnd: string;
}

export interface ContributorDetail extends Attribution {
  series: ExpectedVsActualSeries;
}

export interface AnomalyDetail {
  id: string;
  metric: Pick<MetricDef, "id" | "name" | "unit" | "goodDirection">;
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
  suggested_actions: string[];
  assigned_to: string | null;
  assignee_name: string | null;
  updated_at: string;
  series: ExpectedVsActualSeries;
  contributors: ContributorDetail[];
  /** Real accounts behind the contributing slices; null when broad-based. */
  affected: AffectedAccounts | null;
}

interface SeriesRow {
  date: string;
  value: number;
}

function expectedVsActual(
  rows: SeriesRow[],
  windowStart: string,
  windowEnd: string,
): ExpectedVsActualSeries {
  const values = rows.map((r) => r.value);
  const dows = rows.map((r) => dayOfWeek(r.date));
  const d = decompose(values, dows);

  let startIdx = rows.findIndex((r) => r.date >= windowStart);
  if (startIdx === -1) startIdx = 0;
  let endIdx = rows.findIndex((r) => r.date > windowEnd);
  endIdx = endIdx === -1 ? rows.length - 1 : endIdx - 1;

  const from = Math.max(0, startIdx - CONTEXT_DAYS);
  const to = Math.min(rows.length - 1, endIdx + CONTEXT_DAYS);

  return {
    dates: rows.slice(from, to + 1).map((r) => r.date),
    actual: values.slice(from, to + 1),
    expected: rows
      .slice(from, to + 1)
      .map((_, k) => Number((d.trend[from + k] + d.seasonal[from + k]).toFixed(2))),
    windowStart,
    windowEnd,
  };
}

export function getAnomalyDetail(id: string): AnomalyDetail | null {
  const db = openDb();
  const row = db
    .prepare(
      `SELECT a.*, u.name AS assignee_name
       FROM anomalies a LEFT JOIN users u ON u.id = a.assigned_to
       WHERE a.id = ?`,
    )
    .get(id) as
    | (Omit<
        AnomalyDetail,
        "metric" | "series" | "contributors" | "suggested_actions" | "affected"
      > & {
        metric_id: string;
        attribution: string;
        suggested_actions: string;
      })
    | undefined;
  if (!row) return null;

  const metric = METRIC_BY_ID[row.metric_id];
  const windowEnd = row.end_date ?? row.date;

  const topRows = db
    .prepare(
      `SELECT date, value FROM metrics_daily
       WHERE metric_id = ? AND segment_type = 'all' ORDER BY date`,
    )
    .all(row.metric_id) as SeriesRow[];

  const attribution = JSON.parse(row.attribution) as Attribution[];
  const sign = row.direction === "up" ? 1 : -1;
  const contributors: ContributorDetail[] = attribution
    .filter((a) => sign * a.meanZ >= 1.5)
    .slice(0, 3)
    .map((a) => {
      const sliceRows = db
        .prepare(
          `SELECT date, value FROM metrics_daily
           WHERE metric_id = ? AND segment_type = ? AND segment_value = ?
           ORDER BY date`,
        )
        .all(row.metric_id, a.dimension, a.value) as SeriesRow[];
      return { ...a, series: expectedVsActual(sliceRows, row.date, windowEnd) };
    });

  return {
    id: row.id,
    metric: {
      id: metric.id,
      name: metric.name,
      unit: metric.unit,
      goodDirection: metric.goodDirection,
    },
    date: row.date,
    end_date: row.end_date,
    direction: row.direction,
    severity: row.severity,
    status: row.status,
    expected_value: row.expected_value,
    actual_value: row.actual_value,
    sigma: row.sigma,
    title: row.title,
    summary: row.summary,
    suggested_actions: JSON.parse(row.suggested_actions) as string[],
    assigned_to: row.assigned_to,
    assignee_name: row.assignee_name,
    updated_at: row.updated_at,
    series: expectedVsActual(topRows, row.date, windowEnd),
    contributors,
    affected: getAffectedAccounts(db, contributors, row.id),
  };
}
