import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createDb } from "@/lib/db";
import { runDetection } from "@/lib/ml/run-detection";
import { buildAffectedFilter, getAffectedAccounts } from "@/lib/affected-accounts";
import { seed } from "../scripts/seed";

const END = "2026-06-10";

describe("affected accounts drill-through", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-affected-"));
  const dbPath = path.join(tmpDir, "test.db");
  let db: Database.Database;
  let churnAttribution: { dimension: string; value: string; meanZ: number }[];

  beforeAll(() => {
    db = createDb(dbPath);
    seed(db, END);
    runDetection(db);
    const row = db
      .prepare(
        `SELECT direction, attribution FROM anomalies
         WHERE metric_id = 'churn_rate' ORDER BY sigma DESC LIMIT 1`,
      )
      .get() as { direction: string; attribution: string };
    const sign = row.direction === "up" ? 1 : -1;
    churnAttribution = (JSON.parse(row.attribution) as typeof churnAttribution)
      .filter((a) => sign * a.meanZ >= 1.5)
      .slice(0, 3);
  });

  afterAll(() => {
    db.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort cleanup
    }
  });

  it("buildAffectedFilter takes one strongest slice per dimension, in order", () => {
    const { filter, ordered } = buildAffectedFilter([
      { dimension: "geography", value: "EMEA" },
      { dimension: "plan_tier", value: "Starter" },
      { dimension: "industry", value: "E-commerce" },
      { dimension: "industry", value: "Healthcare" }, // weaker, same dimension: ignored
    ]);
    expect(filter).toEqual({
      geography: "EMEA",
      plan_tier: "Starter",
      industry: "E-commerce",
    });
    expect(ordered.map((o) => o.value)).toEqual(["EMEA", "Starter", "E-commerce"]);
  });

  it("returns null when there are no dimensional contributors", () => {
    expect(getAffectedAccounts(db, [], "an-x")).toBeNull();
  });

  it("resolves the churn spike to its real EMEA Starter E-commerce accounts", () => {
    const affected = getAffectedAccounts(db, churnAttribution, "an-churn");
    expect(affected).not.toBeNull();

    // The scripted churn story attributes to these three slices.
    expect(affected!.filter).toMatchObject({
      geography: "EMEA",
      plan_tier: "Starter",
      industry: "E-commerce",
    });
    expect(affected!.label).toContain("EMEA");
    expect(affected!.label).toContain("Starter");
    expect(affected!.label).toContain("E-commerce");

    // Every previewed account actually matches the segment intersection.
    expect(affected!.count).toBeGreaterThan(0);
    expect(affected!.preview.length).toBeGreaterThan(0);
    for (const acct of affected!.preview) {
      expect(acct.geography).toBe("EMEA");
      expect(acct.plan_tier).toBe("Starter");
      expect(acct.industry).toBe("E-commerce");
    }

    // Preview is highest-risk first.
    const risks = affected!.preview.map((a) => a.churn_risk);
    expect([...risks].sort((a, b) => b - a)).toEqual(risks);

    // Deep link carries the segment filters the customers table reads.
    expect(affected!.customersHref).toContain("tier=Starter");
    expect(affected!.customersHref).toContain("geo=EMEA");
    expect(affected!.customersHref).toContain("industry=E-commerce");
    expect(affected!.customersHref).toContain("anomaly=an-churn");
  });
});
