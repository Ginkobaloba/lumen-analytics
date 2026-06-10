/*
  Metric catalog and dimensional model for the Lumen demo dataset.
  The catalog lives in code (not the DB) so API routes and the generator
  share one definition.
*/

export const PLAN_TIERS = ["Starter", "Growth", "Enterprise"] as const;
export const GEOGRAPHIES = ["NA", "EMEA", "APAC", "LATAM"] as const;
export const INDUSTRIES = [
  "Software",
  "Fintech",
  "Healthcare",
  "E-commerce",
  "Logistics",
  "Media",
] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];
export type Geography = (typeof GEOGRAPHIES)[number];
export type Industry = (typeof INDUSTRIES)[number];

export const SEGMENT_DIMENSIONS = {
  plan_tier: PLAN_TIERS,
  geography: GEOGRAPHIES,
  industry: INDUSTRIES,
} as const;

export type SegmentDimension = keyof typeof SEGMENT_DIMENSIONS;

export type MetricUnit = "currency" | "count" | "percent" | "score" | "hours";
export type MetricCategory =
  | "revenue"
  | "customers"
  | "conversion"
  | "engagement"
  | "support";

export interface MetricDef {
  id: string;
  name: string;
  unit: MetricUnit;
  category: MetricCategory;
  /** Whether daily slices per dimension are generated and stored. */
  sliced: boolean;
  /** Whether an increase is good (drives green/terracotta rendering). */
  goodDirection: "up" | "down";
  /** How slice values combine to the top level. */
  aggregation: "sum" | "weighted_mean";
  description: string;
}

export const METRICS: MetricDef[] = [
  // Revenue
  { id: "mrr", name: "MRR", unit: "currency", category: "revenue", sliced: true, goodDirection: "up", aggregation: "sum", description: "Monthly recurring revenue across all active subscriptions." },
  { id: "arr", name: "ARR", unit: "currency", category: "revenue", sliced: false, goodDirection: "up", aggregation: "sum", description: "Annual recurring revenue (MRR x 12)." },
  { id: "new_mrr", name: "New MRR", unit: "currency", category: "revenue", sliced: true, goodDirection: "up", aggregation: "sum", description: "MRR added by net-new customers." },
  { id: "expansion_mrr", name: "Expansion MRR", unit: "currency", category: "revenue", sliced: true, goodDirection: "up", aggregation: "sum", description: "MRR added by existing customers upgrading or adding seats." },
  { id: "contraction_mrr", name: "Contraction MRR", unit: "currency", category: "revenue", sliced: true, goodDirection: "down", aggregation: "sum", description: "MRR lost to downgrades by retained customers." },
  { id: "churned_mrr", name: "Churned MRR", unit: "currency", category: "revenue", sliced: true, goodDirection: "down", aggregation: "sum", description: "MRR lost to customers cancelling entirely." },
  { id: "arpa", name: "ARPA", unit: "currency", category: "revenue", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Average revenue per account." },
  { id: "nrr", name: "Net Revenue Retention", unit: "percent", category: "revenue", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Revenue retained from the existing base, including expansion." },
  { id: "grr", name: "Gross Revenue Retention", unit: "percent", category: "revenue", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Revenue retained from the existing base, excluding expansion." },

  // Customers
  { id: "active_customers", name: "Active Customers", unit: "count", category: "customers", sliced: true, goodDirection: "up", aggregation: "sum", description: "Accounts with an active paid subscription." },
  { id: "new_customers", name: "New Customers", unit: "count", category: "customers", sliced: true, goodDirection: "up", aggregation: "sum", description: "Accounts that converted to paid." },
  { id: "churned_customers", name: "Churned Customers", unit: "count", category: "customers", sliced: true, goodDirection: "down", aggregation: "sum", description: "Accounts that cancelled." },
  { id: "churn_rate", name: "Churn Rate", unit: "percent", category: "customers", sliced: true, goodDirection: "down", aggregation: "weighted_mean", description: "Monthly logo churn, rolling 30-day window." },
  { id: "logo_retention", name: "Logo Retention", unit: "percent", category: "customers", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Share of logos retained over the trailing 12 months." },

  // Conversion
  { id: "signups", name: "Signups", unit: "count", category: "conversion", sliced: true, goodDirection: "up", aggregation: "sum", description: "New workspace signups (free or trial)." },
  { id: "trials_started", name: "Trials Started", unit: "count", category: "conversion", sliced: false, goodDirection: "up", aggregation: "sum", description: "Trials started from signups." },
  { id: "activations", name: "Activations", unit: "count", category: "conversion", sliced: true, goodDirection: "up", aggregation: "sum", description: "Workspaces reaching the activation milestone (first dashboard shared)." },
  { id: "signup_to_active_rate", name: "Signup to Active Rate", unit: "percent", category: "conversion", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Share of signups that activate within 14 days." },
  { id: "trial_to_paid_rate", name: "Trial to Paid Rate", unit: "percent", category: "conversion", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Share of trials converting to a paid plan." },

  // Engagement
  { id: "dau", name: "Daily Active Users", unit: "count", category: "engagement", sliced: true, goodDirection: "up", aggregation: "sum", description: "Unique users active in the product per day." },
  { id: "wau", name: "Weekly Active Users", unit: "count", category: "engagement", sliced: false, goodDirection: "up", aggregation: "sum", description: "Unique users active in the trailing 7 days." },
  { id: "mau", name: "Monthly Active Users", unit: "count", category: "engagement", sliced: false, goodDirection: "up", aggregation: "sum", description: "Unique users active in the trailing 30 days." },
  { id: "dau_mau_ratio", name: "DAU/MAU Ratio", unit: "percent", category: "engagement", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Stickiness: daily actives as a share of monthly actives." },
  { id: "avg_session_minutes", name: "Avg Session Minutes", unit: "score", category: "engagement", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Average minutes per session." },
  { id: "feature_adoption_dashboards", name: "Feature Adoption: Dashboards", unit: "percent", category: "engagement", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Share of active accounts using dashboards weekly." },
  { id: "feature_adoption_alerts", name: "Feature Adoption: Alerts", unit: "percent", category: "engagement", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Share of active accounts with at least one alert configured." },
  { id: "feature_adoption_reports", name: "Feature Adoption: Reports", unit: "percent", category: "engagement", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Share of active accounts scheduling reports." },
  { id: "feature_adoption_api", name: "Feature Adoption: API", unit: "percent", category: "engagement", sliced: true, goodDirection: "up", aggregation: "weighted_mean", description: "Share of active accounts calling the API weekly." },

  // Support
  { id: "support_tickets", name: "Support Tickets", unit: "count", category: "support", sliced: true, goodDirection: "down", aggregation: "sum", description: "Tickets opened per day." },
  { id: "first_response_hours", name: "First Response Time", unit: "hours", category: "support", sliced: false, goodDirection: "down", aggregation: "weighted_mean", description: "Median hours to first support response." },
  { id: "csat", name: "CSAT", unit: "score", category: "support", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Customer satisfaction score (1-5) on closed tickets." },
  { id: "nps", name: "NPS", unit: "score", category: "support", sliced: false, goodDirection: "up", aggregation: "weighted_mean", description: "Net promoter score, rolling 30-day survey window." },
];

export const METRIC_BY_ID: Record<string, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.id, m]),
);

export const TEAM = [
  { id: "u-priya", name: "Priya Raghavan", email: "priya@lumenanalytics.io", role: "Head of Data", initials: "PR", color: "#178049" },
  { id: "u-marcus", name: "Marcus Webb", email: "marcus@lumenanalytics.io", role: "Revenue Analyst", initials: "MW", color: "#2F6E99" },
  { id: "u-elena", name: "Elena Sorokina", email: "elena@lumenanalytics.io", role: "Growth PM", initials: "ES", color: "#8A6A00" },
  { id: "u-david", name: "David Okafor", email: "david@lumenanalytics.io", role: "Customer Success Lead", initials: "DO", color: "#A84A33" },
  { id: "u-jin", name: "Jin Park", email: "jin@lumenanalytics.io", role: "Data Engineer", initials: "JP", color: "#0F5E36" },
  { id: "u-sofia", name: "Sofia Mendes", email: "sofia@lumenanalytics.io", role: "Product Analyst", initials: "SM", color: "#6B4FA0" },
  { id: "u-tom", name: "Tom Eriksen", email: "tom@lumenanalytics.io", role: "VP Revenue", initials: "TE", color: "#3A403D" },
  { id: "u-aisha", name: "Aisha Drammeh", email: "aisha@lumenanalytics.io", role: "Support Ops", initials: "AD", color: "#B0892F" },
] as const;
