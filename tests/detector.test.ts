import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { decompose } from "@/lib/ml/decompose";
import { detectEpisodes } from "@/lib/ml/detect";
import { runDetection, type DetectionStats } from "@/lib/ml/run-detection";
import { createDb } from "@/lib/db";
import { seed } from "../scripts/seed";

const END = "2026-06-10";

describe("decompose", () => {
  const N = 200;
  const dows = Array.from({ length: N }, (_, i) => i % 7);

  it("yields near-zero residuals on a smooth series (away from the edges)", () => {
    const values = Array.from({ length: N }, (_, i) => 100 + i * 0.1);
    const d = decompose(values, dows);
    // The rolling median is asymmetric at the series boundaries, which is
    // why the detector guards the left edge; only the interior must be clean.
    const interior = d.residual.slice(30, -30).map(Math.abs);
    expect(Math.max(...interior)).toBeLessThan(0.5);
  });

  it("keeps a 2-week pulse out of the trend and flags it in z", () => {
    const values = Array.from({ length: N }, (_, i) => {
      const noise = Math.sin(i * 7.13) * 1.5; // deterministic pseudo-noise
      const pulse = i >= 100 && i < 114 ? 30 : 0;
      return 100 + noise + pulse;
    });
    const d = decompose(values, dows);
    // The rolling median must hold the baseline inside the pulse window.
    expect(d.trend[107]).toBeLessThan(110);
    expect(Math.abs(d.z[107])).toBeGreaterThan(2.5);
  });

  it("detects the pulse as a single up episode with sane bounds", () => {
    const values = Array.from({ length: N }, (_, i) => {
      const noise = Math.sin(i * 7.13) * 1.5;
      const pulse = i >= 100 && i < 114 ? 30 : 0;
      return 100 + noise + pulse;
    });
    const episodes = detectEpisodes({
      dates: values.map((_, i) => `d${i}`),
      values,
      dayOfWeek: dows,
    });
    expect(episodes).toHaveLength(1);
    expect(episodes[0].direction).toBe("up");
    expect(episodes[0].startIndex).toBeGreaterThanOrEqual(98);
    expect(episodes[0].endIndex).toBeLessThanOrEqual(115);
  });
});

describe("detection over the seeded database", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-detect-"));
  const dbPath = path.join(tmpDir, "test.db");
  let db: Database.Database;
  let stats: DetectionStats;

  interface AnomalyRow {
    id: string;
    metric_id: string;
    date: string;
    end_date: string;
    direction: string;
    severity: string;
    status: string;
    attribution: string;
    suggested_actions: string;
    assigned_to: string | null;
  }
  let anomalies: AnomalyRow[];

  beforeAll(() => {
    db = createDb(dbPath);
    seed(db, END);
    stats = runDetection(db);
    anomalies = db
      .prepare("SELECT * FROM anomalies ORDER BY date")
      .all() as AnomalyRow[];
  });

  afterAll(() => {
    db.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // temp dir cleanup is best-effort on Windows
    }
  });

  const overlapping = (metricId: string, from: string, to: string) =>
    anomalies.filter(
      (a) => a.metric_id === metricId && a.date <= to && a.end_date >= from,
    );

  const topSlices = (a: AnomalyRow, n: number) =>
    (JSON.parse(a.attribution) as { dimension: string; value: string }[])
      .slice(0, n)
      .map((s) => `${s.dimension}=${s.value}`);

  it("finds a useful number of anomalies, not noise", () => {
    expect(stats.episodesFound).toBeGreaterThanOrEqual(8);
    expect(stats.episodesFound).toBeLessThanOrEqual(45);
    expect(anomalies.length).toBe(stats.episodesFound);
  });

  it("does not scan the derived arr duplicate", () => {
    expect(anomalies.filter((a) => a.metric_id === "arr")).toHaveLength(0);
  });

  it("detects the month-7 churn spike and attributes it to Starter EMEA", () => {
    const eps = overlapping("churn_rate", "2025-12-14", "2026-01-01");
    expect(eps.length).toBeGreaterThanOrEqual(1);
    const ep = eps[0];
    expect(ep.direction).toBe("up");
    expect(["high", "critical"]).toContain(ep.severity);
    const top2 = topSlices(ep, 2);
    expect(top2).toContain("plan_tier=Starter");
    expect(top2).toContain("geography=EMEA");
  });

  it("detects the month-9 expansion surge and attributes it to Enterprise NA", () => {
    const eps = overlapping("expansion_mrr", "2026-02-13", "2026-02-27");
    expect(eps.length).toBeGreaterThanOrEqual(1);
    const ep = eps[0];
    expect(ep.direction).toBe("up");
    expect(["high", "critical"]).toContain(ep.severity);
    const top2 = topSlices(ep, 2);
    expect(top2).toContain("plan_tier=Enterprise");
    expect(top2).toContain("geography=NA");
  });

  it("detects the month-11 API adoption drop and attributes it to Growth Software", () => {
    const eps = overlapping("feature_adoption_api", "2026-04-14", "2026-04-30");
    expect(eps.length).toBeGreaterThanOrEqual(1);
    const ep = eps[0];
    expect(ep.direction).toBe("down");
    expect(["high", "critical"]).toContain(ep.severity);
    const top2 = topSlices(ep, 2);
    expect(top2).toContain("plan_tier=Growth");
    expect(top2).toContain("industry=Software");
  });

  it("assigns workflow statuses by recency, with owners where triaged", () => {
    const valid = new Set(["active", "acknowledged", "resolved", "false_positive"]);
    for (const a of anomalies) {
      expect(valid.has(a.status), a.id).toBe(true);
      if (a.status === "acknowledged" || a.status === "resolved") {
        expect(a.assigned_to, a.id).not.toBeNull();
      }
    }
    // The April API drop ended within 45 days of the window end: Active.
    const api = overlapping("feature_adoption_api", "2026-04-14", "2026-04-30")[0];
    expect(api.status).toBe("active");
    expect(anomalies.some((a) => a.status === "false_positive")).toBe(true);
  });

  it("writes parseable narrative fields", () => {
    for (const a of anomalies) {
      expect(() => JSON.parse(a.attribution)).not.toThrow();
      const actions = JSON.parse(a.suggested_actions) as string[];
      expect(actions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("is idempotent across reruns", () => {
    const again = runDetection(db);
    expect(again.episodesFound).toBe(stats.episodesFound);
    const ids = (db.prepare("SELECT id FROM anomalies ORDER BY id").all() as { id: string }[])
      .map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
