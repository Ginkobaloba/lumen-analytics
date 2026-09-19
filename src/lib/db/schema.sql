-- Lumen Analytics demo schema (SQLite).
-- Seeded deterministically by scripts/seed.ts. The database is a build
-- artifact, not a source of truth: regenerate any time with `npm run seed`.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL,
  initials    TEXT NOT NULL,
  color       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  domain          TEXT NOT NULL,
  plan_tier       TEXT NOT NULL CHECK (plan_tier IN ('Starter', 'Growth', 'Enterprise')),
  geography       TEXT NOT NULL,
  industry        TEXT NOT NULL,
  signup_date     TEXT NOT NULL,            -- ISO date
  status          TEXT NOT NULL CHECK (status IN ('active', 'churned')),
  mrr             REAL NOT NULL,
  seats           INTEGER NOT NULL,
  owner_user_id   TEXT NOT NULL REFERENCES users(id),
  churn_risk      REAL NOT NULL,            -- 0..1
  expansion_score REAL NOT NULL,            -- 0..1
  last_active_date TEXT,
  churned_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_tier ON customers(plan_tier);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_signup ON customers(signup_date);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  TEXT NOT NULL REFERENCES customers(id),
  type         TEXT NOT NULL,               -- signup | activation | upgrade | downgrade
                                            -- | expansion | churn | support_ticket | login
  occurred_at  TEXT NOT NULL,               -- ISO datetime
  properties   TEXT NOT NULL DEFAULT '{}'   -- JSON
);

CREATE INDEX IF NOT EXISTS idx_events_customer ON events(customer_id);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(type, occurred_at);

-- One row per metric, day, and segment. Top-level series use
-- segment_type = 'all' / segment_value = 'all'. Dimensional slices
-- (plan_tier, geography, industry) carry the same metric aggregated per
-- segment value; additive slices sum to the top-level row by construction,
-- which is what makes cause attribution work.
CREATE TABLE IF NOT EXISTS metrics_daily (
  metric_id     TEXT NOT NULL,
  date          TEXT NOT NULL,              -- ISO date
  segment_type  TEXT NOT NULL DEFAULT 'all',
  segment_value TEXT NOT NULL DEFAULT 'all',
  value         REAL NOT NULL,
  PRIMARY KEY (metric_id, date, segment_type, segment_value)
);

CREATE INDEX IF NOT EXISTS idx_metrics_daily_metric ON metrics_daily(metric_id, segment_type);

-- Populated by the anomaly detector (chunk 2.5), not the generator.
CREATE TABLE IF NOT EXISTS anomalies (
  id                TEXT PRIMARY KEY,
  metric_id         TEXT NOT NULL,
  date              TEXT NOT NULL,           -- first day the anomaly was flagged
  end_date          TEXT,                    -- last day, null while ongoing
  direction         TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  severity          TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'acknowledged', 'resolved', 'false_positive')),
  expected_value    REAL NOT NULL,
  actual_value      REAL NOT NULL,
  sigma             REAL NOT NULL,           -- |residual| / residual sigma at peak
  title             TEXT NOT NULL,
  summary           TEXT NOT NULL,
  attribution       TEXT NOT NULL DEFAULT '[]', -- JSON: ranked contributing slices
  suggested_actions TEXT NOT NULL DEFAULT '[]', -- JSON: strings
  assigned_to       TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_metric ON anomalies(metric_id, date);

-- Immutable snapshot of the seed/detector's anomaly workflow state,
-- written once by runDetection right after it (re)builds `anomalies`.
-- Triage is per-visitor and client-side now (M1 fix, 2026-09-19): nothing
-- in this app should ever UPDATE `anomalies` again. openDb() diffs the
-- live table against this snapshot on the process's first connection and
-- restores drift in `status` and `assigned_to` only -- not other
-- columns, and not row inserts or deletes. This is defense-in-depth
-- against direct tampering with the SQLite file, not a running-container
-- repair: the deployed container mounts no volume, so its database is
-- always freshly seeded at image build (deep-verify report
-- verify/reports/DEEP_VERIFY_2026-09-19_pr35-per-visitor-triage.md).
CREATE TABLE IF NOT EXISTS anomalies_seed_snapshot (
  id          TEXT PRIMARY KEY,
  status      TEXT NOT NULL,
  assigned_to TEXT,
  updated_at  TEXT NOT NULL
);

-- Per-customer series for the customer detail page.
CREATE TABLE IF NOT EXISTS customer_mrr_monthly (
  customer_id TEXT NOT NULL REFERENCES customers(id),
  month       TEXT NOT NULL,                -- ISO date, first of month
  mrr         REAL NOT NULL,
  PRIMARY KEY (customer_id, month)
);

CREATE TABLE IF NOT EXISTS customer_usage_daily (
  customer_id  TEXT NOT NULL REFERENCES customers(id),
  date         TEXT NOT NULL,
  active_users INTEGER NOT NULL,
  api_calls    INTEGER NOT NULL,
  PRIMARY KEY (customer_id, date)
);
