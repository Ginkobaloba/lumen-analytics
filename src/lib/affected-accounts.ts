import "server-only";
import type Database from "better-sqlite3";
import {
  type Geography,
  type Industry,
  type PlanTier,
  type SegmentDimension,
} from "./data/catalog";
import type { Attribution } from "./ml/attribute";

/*
  Anomaly -> segment -> account drill-through. The anomaly panel attributes
  a metric spike to dimensional slices (e.g. EMEA, Starter, E-commerce). This
  module turns those slices into the literal set of customers behind the
  spike, so an investigator lands on real accounts in two clicks: open the
  anomaly, then "View affected accounts".

  The segment is the intersection of the strongest contributing slice per
  dimension. One value per dimension keeps the filter a clean AND that maps
  directly onto the /app/customers table filters.
*/

const DIMENSION_TO_COLUMN: Record<SegmentDimension, "plan_tier" | "geography" | "industry"> = {
  plan_tier: "plan_tier",
  geography: "geography",
  industry: "industry",
};

export interface AffectedSegmentFilter {
  plan_tier?: PlanTier;
  geography?: Geography;
  industry?: Industry;
}

export interface AffectedAccount {
  id: string;
  name: string;
  mrr: number;
  churn_risk: number;
  status: "active" | "churned";
  plan_tier: PlanTier;
  geography: Geography;
  industry: Industry;
}

export interface AffectedAccounts {
  /** Dimensional filter, one value per contributing dimension. */
  filter: AffectedSegmentFilter;
  /** Human label in contributor-strength order, e.g. "EMEA · Starter · E-commerce". */
  label: string;
  /** Total accounts in the segment. */
  count: number;
  /** Of those, how many have already churned. */
  churnedCount: number;
  /** Deep link into the customers table with the segment filters applied. */
  customersHref: string;
  /** Highest-risk accounts first, for an in-panel preview. */
  preview: AffectedAccount[];
}

const PREVIEW_LIMIT = 6;

/** Strongest contributing slice per dimension, preserving contributor
    (meanZ) order, so the label reads in order of impact. */
export function buildAffectedFilter(contributors: Pick<Attribution, "dimension" | "value">[]): {
  filter: AffectedSegmentFilter;
  ordered: { dimension: SegmentDimension; value: string }[];
} {
  const filter: AffectedSegmentFilter = {};
  const ordered: { dimension: SegmentDimension; value: string }[] = [];
  for (const c of contributors) {
    const dim = c.dimension as SegmentDimension;
    const column = DIMENSION_TO_COLUMN[dim];
    if (!column || filter[column] !== undefined) continue;
    (filter as Record<string, string>)[column] = c.value;
    ordered.push({ dimension: dim, value: c.value });
  }
  return { filter, ordered };
}

function buildHref(filter: AffectedSegmentFilter, anomalyId: string): string {
  const params = new URLSearchParams();
  if (filter.plan_tier) params.set("tier", filter.plan_tier);
  if (filter.geography) params.set("geo", filter.geography);
  if (filter.industry) params.set("industry", filter.industry);
  params.set("anomaly", anomalyId);
  return `/app/customers?${params.toString()}`;
}

/** Resolve the accounts behind an anomaly's contributing slices. Returns
    null when the deviation is broad-based (no dimensional contributors),
    in which case the panel falls back to its segment-level attribution. */
export function getAffectedAccounts(
  db: Database.Database,
  contributors: Pick<Attribution, "dimension" | "value">[],
  anomalyId: string,
): AffectedAccounts | null {
  const { filter, ordered } = buildAffectedFilter(contributors);
  if (ordered.length === 0) return null;

  const where: string[] = [];
  const args: string[] = [];
  if (filter.plan_tier) {
    where.push("plan_tier = ?");
    args.push(filter.plan_tier);
  }
  if (filter.geography) {
    where.push("geography = ?");
    args.push(filter.geography);
  }
  if (filter.industry) {
    where.push("industry = ?");
    args.push(filter.industry);
  }

  const rows = db
    .prepare(
      `SELECT id, name, mrr, churn_risk, status, plan_tier, geography, industry
       FROM customers
       WHERE ${where.join(" AND ")}
       ORDER BY churn_risk DESC, mrr DESC`,
    )
    .all(...args) as AffectedAccount[];

  return {
    filter,
    label: ordered.map((o) => o.value).join(" · "),
    count: rows.length,
    churnedCount: rows.filter((r) => r.status === "churned").length,
    customersHref: buildHref(filter, anomalyId),
    preview: rows.slice(0, PREVIEW_LIMIT),
  };
}
