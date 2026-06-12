import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createDb } from "@/lib/db";
import { seed } from "../scripts/seed";

const END = "2026-06-10";

describe("funnel queries", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-funnel-"));
  const dbPath = path.join(tmpDir, "test.db");
  let db: Database.Database;
  let getFunnelData: typeof import("@/lib/queries").getFunnelData;

  beforeAll(async () => {
    db = createDb(dbPath);
    seed(db, END);
    db.close();

    process.env.LUMEN_DB_PATH = dbPath;
    ({ getFunnelData } = await import("@/lib/queries"));
  });

  afterAll(() => {
    delete process.env.LUMEN_DB_PATH;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort cleanup
    }
  });

  it("returns the three trailing windows with the four lifecycle stages", () => {
    const data = getFunnelData();
    expect(data.asOf).toBe(END);
    expect(data.windows.map((w) => w.days)).toEqual([30, 90, 365]);
    for (const w of data.windows) {
      expect(w.stages.map((s) => s.id)).toEqual([
        "signups",
        "trials_started",
        "activations",
        "new_customers",
      ]);
    }
  });

  it("produces a strictly positive, non-increasing funnel in every window", () => {
    for (const w of getFunnelData().windows) {
      for (const [i, stage] of w.stages.entries()) {
        expect(stage.count).toBeGreaterThan(0);
        if (i > 0) {
          expect(stage.count).toBeLessThanOrEqual(w.stages[i - 1].count);
        }
      }
    }
  });

  it("scales with the window: longer windows accumulate more volume", () => {
    const [w30, w90, w365] = getFunnelData().windows;
    for (let i = 0; i < 4; i++) {
      expect(w90.stages[i].count).toBeGreaterThan(w30.stages[i].count);
      expect(w365.stages[i].count).toBeGreaterThan(w90.stages[i].count);
    }
  });
});
