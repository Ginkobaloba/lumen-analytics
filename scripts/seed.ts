/*
  Seeds data/lumen.db with the deterministic demo dataset.
  Usage: npm run seed [-- --end 2026-06-10] [--db path/to.db]

  Same seed + same end date = byte-identical dataset, so screenshots and
  demo walkthroughs stay reproducible.
*/

import type Database from "better-sqlite3";
import { TEAM } from "../src/lib/data/catalog";
import {
  generateCustomers,
  generateCustomerSeries,
} from "../src/lib/data/customers";
import { generateEvents } from "../src/lib/data/events";
import { generateMetrics } from "../src/lib/data/metrics";
import { createDb, DEFAULT_DB_PATH } from "../src/lib/db";

export const DEMO_SEED = 20260610;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function seed(db: Database.Database, endDate: string): void {
  const customers = generateCustomers(DEMO_SEED, endDate);
  const { mrrMonthly, usageDaily } = generateCustomerSeries(
    DEMO_SEED,
    endDate,
    customers,
  );
  const metrics = generateMetrics(DEMO_SEED, endDate, customers);
  const events = generateEvents(DEMO_SEED, endDate, customers);

  const insertUser = db.prepare(
    "INSERT INTO users (id, name, email, role, initials, color) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertCustomer = db.prepare(
    `INSERT INTO customers (id, name, domain, plan_tier, geography, industry,
       signup_date, status, mrr, seats, owner_user_id, churn_risk,
       expansion_score, last_active_date, churned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEvent = db.prepare(
    "INSERT INTO events (customer_id, type, occurred_at, properties) VALUES (?, ?, ?, ?)",
  );
  const insertMetric = db.prepare(
    "INSERT INTO metrics_daily (metric_id, date, segment_type, segment_value, value) VALUES (?, ?, ?, ?, ?)",
  );
  const insertMrrMonthly = db.prepare(
    "INSERT INTO customer_mrr_monthly (customer_id, month, mrr) VALUES (?, ?, ?)",
  );
  const insertUsage = db.prepare(
    "INSERT INTO customer_usage_daily (customer_id, date, active_users, api_calls) VALUES (?, ?, ?, ?)",
  );

  db.transaction(() => {
    for (const u of TEAM) {
      insertUser.run(u.id, u.name, u.email, u.role, u.initials, u.color);
    }
    for (const c of customers) {
      insertCustomer.run(
        c.id, c.name, c.domain, c.plan_tier, c.geography, c.industry,
        c.signup_date, c.status, c.mrr, c.seats, c.owner_user_id,
        c.churn_risk, c.expansion_score, c.last_active_date, c.churned_at,
      );
    }
    for (const e of events) {
      insertEvent.run(e.customer_id, e.type, e.occurred_at, e.properties);
    }
    for (const m of metrics) {
      insertMetric.run(m.metric_id, m.date, m.segment_type, m.segment_value, m.value);
    }
    for (const p of mrrMonthly) {
      insertMrrMonthly.run(p.customer_id, p.month, p.mrr);
    }
    for (const u of usageDaily) {
      insertUsage.run(u.customer_id, u.date, u.active_users, u.api_calls);
    }
  })();
}

function main(): void {
  const endDate = arg("end") ?? new Date().toISOString().slice(0, 10);
  const dbPath = arg("db") ?? DEFAULT_DB_PATH;

  console.log(`Seeding ${dbPath} (window ends ${endDate}, seed ${DEMO_SEED})`);
  const db = createDb(dbPath);
  seed(db, endDate);

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM customers) AS customers,
         (SELECT COUNT(*) FROM events) AS events,
         (SELECT COUNT(*) FROM metrics_daily) AS metrics_daily,
         (SELECT COUNT(*) FROM customer_mrr_monthly) AS mrr_monthly,
         (SELECT COUNT(*) FROM customer_usage_daily) AS usage_daily`,
    )
    .get() as Record<string, number>;
  db.close();

  console.log("Row counts:", counts);
  console.log("Done.");
}

const invokedDirectly =
  process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed.ts") ?? false;
if (invokedDirectly) main();
