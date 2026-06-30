import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createDb } from "@/lib/db";
import { runDetection } from "@/lib/ml/run-detection";
import { seed } from "../scripts/seed";

const END = "2026-06-10";

/*
  anomaly-detail and anomaly-actions are server-only modules; setting
  LUMEN_DB_PATH before the dynamic import points their shared openDb()
  singleton at the test database.
*/

describe("anomaly detail + actions", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-panel-"));
  const dbPath = path.join(tmpDir, "test.db");
  let db: Database.Database;
  let getAnomalyDetail: typeof import("@/lib/anomaly-detail").getAnomalyDetail;
  let applyAnomalyAction: typeof import("@/lib/anomaly-actions").applyAnomalyAction;
  let churnId: string;

  beforeAll(async () => {
    db = createDb(dbPath);
    seed(db, END);
    runDetection(db);
    db.close();

    process.env.LUMEN_DB_PATH = dbPath;
    ({ getAnomalyDetail } = await import("@/lib/anomaly-detail"));
    ({ applyAnomalyAction } = await import("@/lib/anomaly-actions"));

    const detail = getAnomalyDetail("nonexistent");
    expect(detail).toBeNull();

    // Find the scripted churn anomaly id via a fresh read-only connection.
    const Database = (await import("better-sqlite3")).default;
    const reader = new Database(dbPath, { readonly: true });
    churnId = (
      reader
        .prepare(
          `SELECT id FROM anomalies
           WHERE metric_id = 'churn_rate' AND date <= '2026-01-01' AND end_date >= '2025-12-14'`,
        )
        .get() as { id: string }
    ).id;
    reader.close();
  });

  afterAll(() => {
    delete process.env.LUMEN_DB_PATH;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort cleanup
    }
  });

  it("returns the full drill-down payload for the churn spike", () => {
    const d = getAnomalyDetail(churnId);
    expect(d).not.toBeNull();
    expect(d!.metric.id).toBe("churn_rate");
    expect(d!.severity === "high" || d!.severity === "critical").toBe(true);

    // Expected-vs-actual series covers the window plus context.
    expect(d!.series.dates.length).toBeGreaterThan(40);
    expect(d!.series.dates.length).toBe(d!.series.actual.length);
    expect(d!.series.dates.length).toBe(d!.series.expected.length);
    expect(d!.series.dates[0] <= d!.series.windowStart).toBe(true);
    expect(d!.series.dates[d!.series.dates.length - 1] >= d!.series.windowEnd).toBe(true);

    // Actual clearly exceeds expected inside the window for an up anomaly.
    const inWindow = d!.series.dates
      .map((date, i) => ({ date, a: d!.series.actual[i], e: d!.series.expected[i] }))
      .filter((p) => p.date >= d!.series.windowStart && p.date <= d!.series.windowEnd);
    const meanActual = inWindow.reduce((s, p) => s + p.a, 0) / inWindow.length;
    const meanExpected = inWindow.reduce((s, p) => s + p.e, 0) / inWindow.length;
    expect(meanActual).toBeGreaterThan(meanExpected * 1.15);

    // Top contributors are the scripted slices, each with its own series.
    const names = d!.contributors.map((c) => `${c.dimension}=${c.value}`);
    expect(names).toContain("plan_tier=Starter");
    expect(names).toContain("geography=EMEA");
    for (const c of d!.contributors) {
      expect(c.series.dates.length).toBe(c.series.actual.length);
      expect(c.series.expected.length).toBe(c.series.actual.length);
    }
    expect(d!.suggested_actions.length).toBeGreaterThanOrEqual(1);

    // Persisted workflow timestamp is surfaced for the panel.
    expect(typeof d!.updated_at).toBe("string");
    expect(d!.updated_at.length).toBeGreaterThan(0);

    // Affected accounts resolve the contributing slices to real customers.
    expect(d!.affected).not.toBeNull();
    expect(d!.affected!.filter).toMatchObject({ plan_tier: "Starter", geography: "EMEA" });
    expect(d!.affected!.count).toBeGreaterThan(0);
    expect(d!.affected!.preview.length).toBeGreaterThan(0);
    expect(d!.affected!.customersHref).toContain("anomaly=");
  });

  it("applies acknowledge, assign, and false positive transitions", () => {
    const ack = applyAnomalyAction(churnId, { action: "acknowledge" });
    expect(ack).toMatchObject({ ok: true, status: "acknowledged" });
    expect(ack.updated_at).toBeDefined();

    // Persistence: a fresh read reflects the acknowledged state and stamp.
    const reread = getAnomalyDetail(churnId);
    expect(reread!.status).toBe("acknowledged");
    expect(reread!.updated_at).toBe(ack.updated_at);

    const assigned = applyAnomalyAction(churnId, { action: "assign", userId: "u-priya" });
    expect(assigned).toMatchObject({
      ok: true,
      assigned_to: "u-priya",
      assignee_name: "Priya Raghavan",
    });

    expect(applyAnomalyAction(churnId, { action: "false_positive" })).toMatchObject({
      ok: true,
      status: "false_positive",
    });

    expect(applyAnomalyAction(churnId, { action: "assign", userId: "nope" }).ok).toBe(false);
    expect(applyAnomalyAction("missing", { action: "acknowledge" }).ok).toBe(false);
  });
});
