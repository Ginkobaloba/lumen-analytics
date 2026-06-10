import type { SegmentDimension } from "./catalog";

/*
  The three anomalies scripted into the demo dataset (per the Lumen handoff):
  a churn spike in month 7, an expansion surge in month 9, and a feature
  adoption drop in month 11 of the 12-month window. Each is concentrated in
  specific segment cells so the cause-attribution algorithm has real signal
  to find. Day offsets are from the start of the 365-day window.
*/

export interface EmbeddedAnomaly {
  key: string;
  metricIds: string[];
  /** Day offsets within the 365-day window, inclusive. */
  startDay: number;
  endDay: number;
  /** Multiplier applied to matching cells (>1 spike, <1 drop). */
  multiplier: number;
  /** Cells match when every listed dimension has the listed value. */
  concentration: Partial<Record<SegmentDimension, string>>;
}

export const EMBEDDED_ANOMALIES: EmbeddedAnomaly[] = [
  {
    key: "churn-spike-m7",
    metricIds: ["churned_mrr", "churned_customers", "churn_rate"],
    startDay: 186,
    endDay: 204,
    multiplier: 3.0,
    concentration: { plan_tier: "Starter", geography: "EMEA" },
  },
  {
    key: "expansion-surge-m9",
    metricIds: ["expansion_mrr"],
    startDay: 247,
    endDay: 261,
    multiplier: 2.6,
    concentration: { plan_tier: "Enterprise", geography: "NA" },
  },
  {
    key: "feature-adoption-drop-m11",
    metricIds: ["feature_adoption_api"],
    startDay: 307,
    endDay: 323,
    multiplier: 0.4,
    concentration: { plan_tier: "Growth", industry: "Software" },
  },
];
