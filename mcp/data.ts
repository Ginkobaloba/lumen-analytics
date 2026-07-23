/*
  Read-only data access for the Lumen Analytics MCP server.

  This module is deliberately decoupled from the Next.js data layer in
  `src/lib/`. Those modules import `server-only`, whose default export throws
  the moment it is loaded outside a React Server Component bundle, so they
  cannot be reused from a plain Node process. Instead this file opens the same
  SQLite build artifact in READ-ONLY mode and reuses only the pure metric
  catalog (`src/lib/data/catalog.ts`), which has no runtime dependencies.

  The database (`data/lumen.db`) is a deterministic build artifact produced by
  `npm run seed:full`. Point at a different file with the LUMEN_DB_PATH env var,
  the same override the app honours.
*/

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  METRICS,
  METRIC_BY_ID,
  type MetricDef,
} from "../src/lib/data/catalog";

export { METRICS, METRIC_BY_ID };
export type { MetricDef };

// __dirname at runtime: <repo>/mcp/dist/mcp. The seeded database lives at the
// repository root under data/. Resolve up three levels to the repo root.
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
export const DEFAULT_DB_PATH = path.join(REPO_ROOT, "data", "lumen.db");

let cached: Database.Database | null = null;

/** Open (once) the seeded database read-only. Throws an actionable error if
    the build artifact has not been generated yet. */
export function openReadOnlyDb(): Database.Database {
  if (cached) return cached;
  const dbPath = process.env.LUMEN_DB_PATH ?? DEFAULT_DB_PATH;
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Lumen database not found at ${dbPath}. Generate it with \`npm run seed:full\` ` +
        `(from the repository root), or set LUMEN_DB_PATH to an existing lumen.db.`,
    );
  }
  cached = new Database(dbPath, { readonly: true, fileMustExist: true });
  return cached;
}

// ---------------------------------------------------------------------------
// Metric search
// ---------------------------------------------------------------------------

export interface MetricMatch {
  id: string;
  name: string;
  category: MetricDef["category"];
  unit: MetricDef["unit"];
  good_direction: MetricDef["goodDirection"];
  sliced: boolean;
  description: string;
  /** Relevance score; higher is a closer match to the query. */
  score: number;
}

/** Keyword relevance search over the metric catalog. Not embeddings-based:
    the query is tokenised and scored against each metric's id, name,
    category, unit, and description, weighted so a name/id hit outranks a
    description-only hit. Deterministic and dependency-free, which is what a
    demo catalog of 32 metrics wants. */
export function searchMetrics(query: string, limit: number): MetricMatch[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);

  const scored = METRICS.map((m, index) => {
    const id = m.id.toLowerCase();
    const name = m.name.toLowerCase();
    const category = m.category.toLowerCase();
    const unit = m.unit.toLowerCase();
    const description = m.description.toLowerCase();

    let score = 0;
    for (const token of tokens) {
      if (id.includes(token) || name.includes(token)) score += 3;
      if (category === token) score += 2;
      else if (category.includes(token)) score += 1;
      if (unit === token) score += 1;
      if (description.includes(token)) score += 1;
    }
    return { m, index, score };
  });

  return scored
    .filter((s) => s.score > 0)
    // Highest score first; ties fall back to catalog order for stable output.
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ m, score }) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      unit: m.unit,
      good_direction: m.goodDirection,
      sliced: m.sliced,
      description: m.description,
      score,
    }));
}

// ---------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------

export type AnomalySeverity = "low" | "medium" | "high" | "critical";
export type AnomalyStatus =
  | "active"
  | "acknowledged"
  | "resolved"
  | "false_positive";

export interface AnomalyRow {
  id: string;
  metric_id: string;
  metric_name: string;
  date: string;
  end_date: string | null;
  direction: "up" | "down";
  severity: AnomalySeverity;
  status: AnomalyStatus;
  expected_value: number;
  actual_value: number;
  sigma: number;
  title: string;
  summary: string;
  assignee_name: string | null;
}

export interface AnomalyFilters {
  limit: number;
  offset: number;
  severity?: AnomalySeverity;
  status?: AnomalyStatus;
  metric_id?: string;
}

export interface AnomalyPage {
  total: number;
  rows: AnomalyRow[];
}

// Order severities by importance for a stable, meaningful sort within a day.
const SEVERITY_RANK_SQL = `CASE a.severity
  WHEN 'critical' THEN 0 WHEN 'high' THEN 1
  WHEN 'medium' THEN 2 ELSE 3 END`;

function resolveMetricName(row: AnomalyRow): AnomalyRow {
  return {
    ...row,
    metric_name: METRIC_BY_ID[row.metric_id]?.name ?? row.metric_id,
  };
}

/** Recent anomaly episodes, newest first, with optional filters and paging. */
export function listAnomalies(filters: AnomalyFilters): AnomalyPage {
  const db = openReadOnlyDb();

  const where: string[] = [];
  const params: Record<string, string> = {};
  if (filters.severity) {
    where.push("a.severity = @severity");
    params.severity = filters.severity;
  }
  if (filters.status) {
    where.push("a.status = @status");
    params.status = filters.status;
  }
  if (filters.metric_id) {
    where.push("a.metric_id = @metric_id");
    params.metric_id = filters.metric_id;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM anomalies a ${whereSql}`)
      .get(params) as { n: number }
  ).n;

  const rows = db
    .prepare(
      `SELECT a.id, a.metric_id, a.metric_id AS metric_name, a.date, a.end_date,
              a.direction, a.severity, a.status, a.expected_value, a.actual_value,
              a.sigma, a.title, a.summary, u.name AS assignee_name
       FROM anomalies a
       LEFT JOIN users u ON u.id = a.assigned_to
       ${whereSql}
       ORDER BY a.date DESC, ${SEVERITY_RANK_SQL}, a.sigma DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: filters.limit, offset: filters.offset }) as AnomalyRow[];

  return { total, rows: rows.map(resolveMetricName) };
}

// ---------------------------------------------------------------------------
// Per-slice cause attribution
// ---------------------------------------------------------------------------

export interface Contributor {
  dimension: string; // plan_tier | geography | industry
  value: string; // e.g. "Starter", "EMEA", "Software"
  mean_z: number; // mean signed z inside the episode window
  lift: number; // slice lift vs its own expected level in the window
  contribution_share: number | null; // additive metrics only; null for rates
}

export interface AnomalyAttribution {
  anomaly: Omit<AnomalyRow, "assignee_name"> & { assignee_name: string | null };
  contributors: Contributor[];
  suggested_actions: string[];
}

interface RawAttribution {
  dimension: string;
  value: string;
  meanZ: number;
  lift: number;
  contributionShare: number | null;
}

/** Full attribution payload for a single anomaly id, or null if unknown. The
    ranked contributing slices are stored on the anomaly row as JSON by the
    detector (`scripts/detect.ts`); this reads them back, it does not recompute. */
export function getAnomalyAttribution(id: string): AnomalyAttribution | null {
  const db = openReadOnlyDb();
  const row = db
    .prepare(
      `SELECT a.id, a.metric_id, a.metric_id AS metric_name, a.date, a.end_date,
              a.direction, a.severity, a.status, a.expected_value, a.actual_value,
              a.sigma, a.title, a.summary, a.attribution, a.suggested_actions,
              u.name AS assignee_name
       FROM anomalies a
       LEFT JOIN users u ON u.id = a.assigned_to
       WHERE a.id = @id`,
    )
    .get({ id }) as
    | (AnomalyRow & { attribution: string; suggested_actions: string })
    | undefined;
  if (!row) return null;

  const { attribution, suggested_actions, ...anomaly } = row;
  const raw = JSON.parse(attribution) as RawAttribution[];
  const contributors: Contributor[] = raw.map((a) => ({
    dimension: a.dimension,
    value: a.value,
    mean_z: a.meanZ,
    lift: a.lift,
    contribution_share: a.contributionShare,
  }));

  return {
    anomaly: resolveMetricName(anomaly as AnomalyRow),
    contributors,
    suggested_actions: JSON.parse(suggested_actions) as string[],
  };
}
