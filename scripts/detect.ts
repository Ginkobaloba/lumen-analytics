/*
  Runs anomaly detection + cause attribution over data/lumen.db and
  rewrites the anomalies table. Run after `npm run seed`.

  Usage: npm run detect [-- --db path/to.db]
*/

import Database from "better-sqlite3";
import { runDetection } from "../src/lib/ml/run-detection";
import { DEFAULT_DB_PATH } from "../src/lib/db";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dbPath = arg("db") ?? DEFAULT_DB_PATH;
const db = new Database(dbPath, { fileMustExist: true });
db.pragma("journal_mode = WAL");

const stats = runDetection(db);
console.log(
  `Scanned ${stats.metricsScanned} metrics, found ${stats.episodesFound} anomalies:`,
  stats.bySeverity,
);

const top = db
  .prepare(
    `SELECT metric_id, date, end_date, direction, severity, status,
            ROUND(sigma, 1) AS sigma, title
     FROM anomalies ORDER BY sigma DESC LIMIT 12`,
  )
  .all();
console.table(top);
db.close();
