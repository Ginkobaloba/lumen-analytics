import type Database from "better-sqlite3";
import {
  METRICS,
  SEGMENT_DIMENSIONS,
  TEAM,
  type MetricDef,
} from "../data/catalog";
import { dayOfWeek, diffDays } from "../data/dates";
import { attributeEpisode, topContributors, type SliceSeries } from "./attribute";
import { detectEpisodes, type Episode, type SeriesInput } from "./detect";
import { episodeSummary, episodeTitle, suggestedActions } from "./narrative";

/*
  Runs detection over every top-level metric series in metrics_daily,
  attributes each episode across the dimensional slices, and rewrites the
  anomalies table. Deterministic end to end: same database in, same
  anomalies out.

  Workflow statuses are seeded by recency so the demo reads lived-in:
  recent episodes are Active, mid-aged ones Acknowledged with an owner,
  old ones Resolved, and one old low-severity episode is marked False
  Positive to show the triage path.
*/

interface MetricRowSlim {
  date: string;
  value: number;
  segment_type: string;
  segment_value: string;
}

function toSeries(rows: { date: string; value: number }[]): SeriesInput {
  return {
    dates: rows.map((r) => r.date),
    values: rows.map((r) => r.value),
    dayOfWeek: rows.map((r) => dayOfWeek(r.date)),
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface DetectionStats {
  metricsScanned: number;
  episodesFound: number;
  bySeverity: Record<Episode["severity"], number>;
}

export function runDetection(db: Database.Database): DetectionStats {
  const metricRows = db
    .prepare(
      `SELECT metric_id, date, segment_type, segment_value, value
       FROM metrics_daily ORDER BY metric_id, segment_type, segment_value, date`,
    )
    .all() as (MetricRowSlim & { metric_id: string })[];

  // Group rows by metric and segment in one pass.
  const byMetric = new Map<string, Map<string, MetricRowSlim[]>>();
  for (const r of metricRows) {
    const seg = `${r.segment_type}|${r.segment_value}`;
    let inner = byMetric.get(r.metric_id);
    if (!inner) byMetric.set(r.metric_id, (inner = new Map()));
    let arr = inner.get(seg);
    if (!arr) inner.set(seg, (arr = []));
    arr.push(r);
  }

  const insert = db.prepare(
    `INSERT INTO anomalies (id, metric_id, date, end_date, direction, severity,
       status, expected_value, actual_value, sigma, title, summary,
       attribution, suggested_actions, assigned_to, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // arr is mrr x 12 by construction; scanning both would double-report
  // every revenue anomaly.
  const excluded = new Set(["arr"]);

  const lastDate = metricRows[metricRows.length - 1]?.date ?? "";
  const stats: DetectionStats = {
    metricsScanned: 0,
    episodesFound: 0,
    bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
  };
  let oldLowSeverityMarked = false;

  db.transaction(() => {
    db.prepare("DELETE FROM anomalies").run();

    for (const metric of METRICS) {
      if (excluded.has(metric.id)) continue;
      const segments = byMetric.get(metric.id);
      if (!segments) continue;
      const topRows = segments.get("all|all");
      if (!topRows || topRows.length < 60) continue;
      stats.metricsScanned++;

      const topSeries = toSeries(topRows);
      const episodes = detectEpisodes(topSeries);

      const slices: SliceSeries[] = [];
      if (metric.sliced) {
        for (const [dim, values] of Object.entries(SEGMENT_DIMENSIONS)) {
          for (const value of values) {
            const rows = segments.get(`${dim}|${value}`);
            if (rows && rows.length === topRows.length) {
              slices.push({ dimension: dim, value, series: toSeries(rows) });
            }
          }
        }
      }

      for (const ep of episodes) {
        const attribution = metric.sliced
          ? attributeEpisode(ep, slices, {
              additive: metric.aggregation === "sum",
            })
          : [];
        const contributors = metric.sliced
          ? topContributors(attribution, ep)
          : [];

        const id = `an-${metric.id}-${ep.startDate}`;
        const ageDays = diffDays(ep.endDate, lastDate);

        let status: "active" | "acknowledged" | "resolved" | "false_positive";
        if (ageDays <= 45) status = "active";
        else if (ageDays <= 120) status = "acknowledged";
        else status = "resolved";
        // One old low-severity episode demonstrates the triage path.
        if (!oldLowSeverityMarked && status === "resolved" && ep.severity === "low") {
          status = "false_positive";
          oldLowSeverityMarked = true;
        }

        const assignee =
          status === "active"
            ? null
            : TEAM[hashString(id) % TEAM.length].id;

        insert.run(
          id,
          metric.id,
          ep.startDate,
          ep.endDate,
          ep.direction,
          ep.severity,
          status,
          Math.round(ep.expectedAtPeak * 100) / 100,
          Math.round(ep.actualAtPeak * 100) / 100,
          Math.round(Math.abs(ep.peakZ) * 100) / 100,
          episodeTitle(metric, ep),
          episodeSummary(metric, ep, contributors),
          JSON.stringify(attribution.slice(0, 12)),
          JSON.stringify(suggestedActions(metric, ep, contributors)),
          assignee,
          `${ep.endDate}T08:00:00Z`,
          `${ep.endDate}T08:00:00Z`,
        );
        stats.episodesFound++;
        stats.bySeverity[ep.severity]++;
      }
    }
  })();

  return stats;
}

export type { Episode, MetricDef };
