import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@/lib/db";
import { seed } from "../scripts/seed";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-seed-"));
const dbPath = path.join(tmpDir, "test.db");

afterAll(() => {
  // SQLite WAL handles can linger briefly on Windows; retry, never fail
  // the suite over temp-dir cleanup.
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // leave the temp dir for the OS to clean up
  }
});

describe("seed integration", () => {
  it("creates a database with the full demo dataset", () => {
    const db = createDb(dbPath);
    seed(db, "2026-06-10");

    const count = (table: string): number =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

    expect(count("users")).toBe(8);
    expect(count("customers")).toBe(500);
    expect(count("events")).toBe(2000);
    expect(count("customer_mrr_monthly")).toBe(500 * 12);
    expect(count("customer_usage_daily")).toBe(500 * 90);

    // 32 metrics x 365 days at top level, plus 13 slice rows per day for
    // each of the 14 sliced metrics.
    const topRows = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM metrics_daily WHERE segment_type = 'all'",
        )
        .get() as { n: number }
    ).n;
    expect(topRows).toBe(32 * 365);

    const sliceRows = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM metrics_daily WHERE segment_type != 'all'",
        )
        .get() as { n: number }
    ).n;
    expect(sliceRows).toBe(14 * 365 * 13);

    db.close();
  });
});
