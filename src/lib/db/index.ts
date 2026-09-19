import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/*
  SQLite access for the demo. The database file is a deterministic build
  artifact produced by `npm run seed`; it is gitignored and regenerated on
  deploy. DB_PATH can be overridden for tests.
*/

export const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "lumen.db");

let db: Database.Database | null = null;

export function openDb(dbPath: string = process.env.LUMEN_DB_PATH ?? DEFAULT_DB_PATH): Database.Database {
  if (db) return db;
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Lumen database not found at ${dbPath}. Run \`npm run seed\` first.`,
    );
  }
  db = new Database(dbPath, { readonly: false, fileMustExist: true });
  db.pragma("journal_mode = WAL");
  restoreAnomaliesToSeed(db);
  return db;
}

/**
 * M1 guard: anomaly triage moved client-side (per-visitor localStorage
 * overlay, see src/lib/triage-overlay.ts) and nothing writes to the
 * `anomalies` table anymore. This runs once, on the process's first
 * connection, and restores any row that still drifted from the
 * anomalies_seed_snapshot table -- leftover state from before this fix,
 * in a container whose SQLite file survives until the next redeploy.
 * Older database files (predating the snapshot table) are left alone.
 */
function restoreAnomaliesToSeed(instance: Database.Database): void {
  const hasSnapshot = instance
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'anomalies_seed_snapshot'",
    )
    .get();
  if (!hasSnapshot) return;

  const drifted = instance
    .prepare(
      `SELECT COUNT(*) AS n FROM anomalies a
       JOIN anomalies_seed_snapshot s ON s.id = a.id
       WHERE a.status IS NOT s.status OR a.assigned_to IS NOT s.assigned_to`,
    )
    .get() as { n: number };
  if (drifted.n === 0) return;

  instance
    .prepare(
      `UPDATE anomalies
       SET status = (SELECT status FROM anomalies_seed_snapshot WHERE id = anomalies.id),
           assigned_to = (SELECT assigned_to FROM anomalies_seed_snapshot WHERE id = anomalies.id),
           updated_at = (SELECT updated_at FROM anomalies_seed_snapshot WHERE id = anomalies.id)
       WHERE id IN (SELECT id FROM anomalies_seed_snapshot)`,
    )
    .run();

  // eslint-disable-next-line no-console -- operational signal only, not user-facing
  console.warn(
    `[lumen] restored ${drifted.n} anomaly row(s) to seed state on startup (M1 guard)`,
  );
}

/** Create (or recreate) a database file with the schema applied.

    Prefers a clean slate (delete + recreate), but on Windows an open
    handle (e.g. a running dev server) makes the unlink fail with EBUSY.
    In that case reset in place: drop every table through SQLite, which
    tolerates concurrent connections, and re-apply the schema. */
export function createDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  let cleanSlate = true;
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = `${dbPath}${suffix}`;
    if (!fs.existsSync(p)) continue;
    try {
      fs.rmSync(p);
    } catch {
      cleanSlate = false;
      break;
    }
  }

  const fresh = new Database(dbPath);
  fresh.pragma("journal_mode = WAL");
  if (!cleanSlate) {
    fresh.pragma("foreign_keys = OFF");
    const tables = fresh
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[];
    for (const t of tables) {
      fresh.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    }
    fresh.pragma("foreign_keys = ON");
  }
  const schema = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "db", "schema.sql"),
    "utf8",
  );
  fresh.exec(schema);
  return fresh;
}
