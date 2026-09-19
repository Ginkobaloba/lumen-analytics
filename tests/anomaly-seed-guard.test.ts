import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb } from "@/lib/db";
import { runDetection } from "@/lib/ml/run-detection";
import { seed } from "../scripts/seed";

const END = "2026-06-10";

/*
  M1 guard: triage is per-visitor and client-side now, so nothing should
  ever UPDATE the shared `anomalies` table again. This is belt-and-
  suspenders for a container whose SQLite file was already mutated by
  the old unauthenticated route before this fix shipped, and won't get a
  fresh seed until the next redeploy: openDb() diffs `anomalies` against
  the anomalies_seed_snapshot table runDetection writes, and restores
  any drift on the process's first connection.
*/
describe("anomaly seed-restore guard (M1)", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-seed-guard-"));
  const dbPath = path.join(tmpDir, "test.db");
  let anomalyId: string;
  let seededStatus: string;
  let seededAssignedTo: string | null;

  beforeAll(() => {
    const db = createDb(dbPath);
    seed(db, END);
    runDetection(db);
    // Pick a row with an assignee and a status detection wouldn't have
    // seeded as false_positive, so a mutation to ("false_positive", NULL)
    // is unambiguously different from seed.
    const row = db
      .prepare(
        `SELECT id, status, assigned_to FROM anomalies
         WHERE status != 'false_positive' AND assigned_to IS NOT NULL
         LIMIT 1`,
      )
      .get() as { id: string; status: string; assigned_to: string };
    anomalyId = row.id;
    seededStatus = row.status;
    seededAssignedTo = row.assigned_to;
    db.close();
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort cleanup
    }
  });

  it("runDetection snapshots seed state for every anomaly row", async () => {
    process.env.LUMEN_DB_PATH = dbPath;
    vi.resetModules();
    const { openDb } = await import("@/lib/db");
    const db = openDb();

    const anomalies = (db.prepare("SELECT COUNT(*) AS n FROM anomalies").get() as { n: number }).n;
    const snapshot = (
      db.prepare("SELECT COUNT(*) AS n FROM anomalies_seed_snapshot").get() as { n: number }
    ).n;
    expect(snapshot).toBeGreaterThan(0);
    expect(snapshot).toBe(anomalies);

    delete process.env.LUMEN_DB_PATH;
  });

  it("restores a row an old container mutated before this fix, on the next process start", async () => {
    // Simulate the pre-fix bug: a write straight to `anomalies` via a
    // fresh connection, bypassing openDb()'s singleton (and its guard)
    // entirely -- exactly what the old unauthenticated route did.
    const Database = (await import("better-sqlite3")).default;
    const attacker = new Database(dbPath);
    attacker
      .prepare(
        `UPDATE anomalies SET status = 'false_positive', assigned_to = NULL,
           updated_at = '1970-01-01T00:00:00Z' WHERE id = ?`,
      )
      .run(anomalyId);
    const mutated = attacker
      .prepare("SELECT status, assigned_to FROM anomalies WHERE id = ?")
      .get(anomalyId) as { status: string; assigned_to: string | null };
    attacker.close();
    expect(mutated).toEqual({ status: "false_positive", assigned_to: null });

    // "Next process start": a fresh module graph, so openDb()'s
    // in-memory singleton and its one-time guard both run again.
    process.env.LUMEN_DB_PATH = dbPath;
    vi.resetModules();
    const { openDb } = await import("@/lib/db");
    const db = openDb();

    const restored = db
      .prepare("SELECT status, assigned_to FROM anomalies WHERE id = ?")
      .get(anomalyId) as { status: string; assigned_to: string | null };
    expect(restored.status).toBe(seededStatus);
    expect(restored.assigned_to).toBe(seededAssignedTo);

    delete process.env.LUMEN_DB_PATH;
  });
});
