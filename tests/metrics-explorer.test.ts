import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { METRICS, SEGMENT_DIMENSIONS } from "@/lib/data/catalog";
import { createDb } from "@/lib/db";
import { runDetection } from "@/lib/ml/run-detection";
import { seed } from "../scripts/seed";

const END = "2026-06-10";

/*
  queries.ts is server-only; setting LUMEN_DB_PATH before the dynamic
  import points its shared openDb() singleton at the test database.
*/

describe("metrics explorer queries", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-metrics-"));
  const dbPath = path.join(tmpDir, "test.db");
  let db: Database.Database;
  let getMetricsExplorerData: typeof import("@/lib/queries").getMetricsExplorerData;
  let getMetricDetail: typeof import("@/lib/queries").getMetricDetail;

  beforeAll(async () => {
    db = createDb(dbPath);
    seed(db, END);
    runDetection(db);
    db.close();

    process.env.LUMEN_DB_PATH = dbPath;
    ({ getMetricsExplorerData, getMetricDetail } = await import("@/lib/queries"));
  });

  afterAll(() => {
    delete process.env.LUMEN_DB_PATH;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort cleanup
    }
  });

  it("covers the full catalog, grouped by category in catalog order", () => {
    const groups = getMetricsExplorerData();
    const flattened = groups.flatMap((g) => g.metrics);

    expect(flattened.length).toBe(METRICS.length);
    expect(groups.map((g) => g.category)).toEqual([
      "revenue",
      "customers",
      "conversion",
      "engagement",
      "support",
    ]);
    // Within each group the catalog order is preserved.
    expect(flattened.map((m) => m.metric.id)).toEqual(METRICS.map((m) => m.id));

    for (const summary of flattened) {
      expect(summary.spark.length).toBe(90);
      expect(Number.isFinite(summary.current)).toBe(true);
      expect(summary.anomalyCount).toBeGreaterThanOrEqual(0);
    }

    // The scripted churn-rate anomaly shows up in the card counts.
    const churn = flattened.find((m) => m.metric.id === "churn_rate")!;
    expect(churn.anomalyCount).toBeGreaterThanOrEqual(1);
  });

  it("returns the 12-month series with this metric's anomalies", () => {
    const detail = getMetricDetail("churn_rate")!;
    expect(detail).not.toBeNull();

    expect(detail.series.length).toBe(365);
    expect(detail.asOf).toBe(END);
    // Series is ascending and ends at the as-of date.
    expect(detail.series[0].date < detail.series[364].date).toBe(true);
    expect(detail.series[364].date).toBe(END);

    // Every anomaly belongs to this metric and lands inside the series.
    expect(detail.anomalies.length).toBeGreaterThanOrEqual(1);
    const dates = new Set(detail.series.map((p) => p.date));
    for (const a of detail.anomalies) {
      expect(a.metric_id).toBe("churn_rate");
      expect(dates.has(a.date)).toBe(true);
    }
    // The scripted December churn spike is present.
    expect(
      detail.anomalies.some(
        (a) => a.date <= "2026-01-01" && (a.end_date ?? a.date) >= "2025-12-14",
      ),
    ).toBe(true);
  });

  it("exposes every dimension's slices for sliced metrics", () => {
    const detail = getMetricDetail("churned_mrr")!;
    expect(detail.metric.sliced).toBe(true);
    expect(detail.dimensions.map((d) => d.dimension)).toEqual([
      "plan_tier",
      "geography",
      "industry",
    ]);

    for (const dim of detail.dimensions) {
      const expected = SEGMENT_DIMENSIONS[dim.dimension];
      expect(dim.slices.map((s) => s.value)).toEqual([...expected]);
      for (const slice of dim.slices) {
        expect(slice.series.length).toBe(detail.series.length);
      }
    }

    // Additive metric: each dimension's slices sum to the top level.
    const top = new Map(detail.series.map((p) => [p.date, p.value]));
    for (const dim of detail.dimensions) {
      for (const [i, point] of detail.series.entries()) {
        const sum = dim.slices.reduce((s, sl) => s + sl.series[i].value, 0);
        expect(Math.abs(sum - top.get(point.date)!)).toBeLessThan(0.01);
      }
    }
  });

  it("returns empty dimensions for unsliced metrics and null for unknown ids", () => {
    const detail = getMetricDetail("nps")!;
    expect(detail.metric.sliced).toBe(false);
    expect(detail.dimensions).toEqual([]);

    expect(getMetricDetail("not_a_metric")).toBeNull();
  });
});
