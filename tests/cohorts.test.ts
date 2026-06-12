import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createDb } from "@/lib/db";
import { seed } from "../scripts/seed";

const END = "2026-06-10";

describe("cohort queries", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-cohorts-"));
  const dbPath = path.join(tmpDir, "test.db");
  let db: Database.Database;
  let getCohortData: typeof import("@/lib/queries").getCohortData;

  beforeAll(async () => {
    db = createDb(dbPath);
    seed(db, END);
    db.close();

    process.env.LUMEN_DB_PATH = dbPath;
    ({ getCohortData } = await import("@/lib/queries"));
  });

  afterAll(() => {
    delete process.env.LUMEN_DB_PATH;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort cleanup
    }
  });

  it("covers the trailing 12 months with one row per non-empty cohort", () => {
    const data = getCohortData();
    expect(data.months.length).toBe(12);
    expect(data.asOf).toBe(data.months[11]);
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.rows.length).toBeLessThanOrEqual(12);
    for (const row of data.rows) {
      expect(data.months).toContain(row.month);
      expect(row.size).toBeGreaterThan(0);
      expect(row.nrr.length).toBe(12);
      expect(row.logo.length).toBe(12);
    }
    // Recent-dense signups keep late cohorts populated, but the partial
    // current month can be empty: the generator's minimum account age is
    // 14 days, so no one signs up inside the trailing two weeks.
    expect(data.rows.map((r) => r.month)).toContain(data.months[10]);
  });

  it("anchors every cohort at 100% NRR in month 0 and keeps the triangle shape", () => {
    const data = getCohortData();
    const monthIndex = new Map(data.months.map((m, i) => [m, i]));
    for (const row of data.rows) {
      const mi = monthIndex.get(row.month)!;
      expect(row.nrr[0]).toBe(100);
      for (let k = 0; k < 12; k++) {
        const inTriangle = mi + k < 12;
        expect(row.nrr[k] === null).toBe(!inTriangle);
        expect(row.logo[k] === null).toBe(!inTriangle);
        if (inTriangle) {
          expect(row.logo[k]!).toBeGreaterThanOrEqual(0);
          expect(row.logo[k]!).toBeLessThanOrEqual(100);
          expect(row.nrr[k]!).toBeGreaterThan(0);
        }
      }
      // Logo retention can only fall as the cohort ages.
      const logos = row.logo.filter((v): v is number => v !== null);
      for (let i = 1; i < logos.length; i++) {
        expect(logos[i]).toBeLessThanOrEqual(logos[i - 1]);
      }
    }
  });

  it("counts every in-window customer exactly once", async () => {
    const data = getCohortData();
    const total = data.rows.reduce((s, r) => s + r.size, 0);

    const Database = (await import("better-sqlite3")).default;
    const reader = new Database(dbPath, { readonly: true });
    const expected = (
      reader
        .prepare(
          `SELECT COUNT(*) AS n FROM customers WHERE substr(signup_date, 1, 7) >= substr(?, 1, 7)`,
        )
        .get(data.months[0]) as { n: number }
    ).n;
    reader.close();

    expect(total).toBe(expected);
  });
});
