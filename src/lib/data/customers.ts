import {
  GEOGRAPHIES,
  INDUSTRIES,
  PLAN_TIERS,
  TEAM,
  type Geography,
  type Industry,
  type PlanTier,
} from "./catalog";
import { addDays } from "./dates";
import {
  childSeed,
  chance,
  float,
  int,
  mulberry32,
  pick,
  weightedPick,
  type Rng,
} from "./prng";

export interface Customer {
  id: string;
  name: string;
  domain: string;
  plan_tier: PlanTier;
  geography: Geography;
  industry: Industry;
  signup_date: string;
  status: "active" | "churned";
  mrr: number;
  seats: number;
  owner_user_id: string;
  churn_risk: number;
  expansion_score: number;
  last_active_date: string | null;
  churned_at: string | null;
}

const TIER_COUNTS: Record<PlanTier, number> = {
  Starter: 300,
  Growth: 150,
  Enterprise: 50,
};

const TIER_MRR: Record<PlanTier, [number, number]> = {
  Starter: [49, 299],
  Growth: [400, 1800],
  Enterprise: [2500, 14000],
};

const TIER_SEATS: Record<PlanTier, [number, number]> = {
  Starter: [2, 15],
  Growth: [10, 80],
  Enterprise: [50, 600],
};

/* Geography and industry weights skew toward NA/Software the way a real
   B2B SaaS book of business does, while leaving enough EMEA Starter
   customers for the month-7 churn-spike story to be plausible. */
const GEO_WEIGHTS = [0.46, 0.3, 0.16, 0.08];
const INDUSTRY_WEIGHTS = [0.32, 0.18, 0.14, 0.16, 0.1, 0.1];

const NAME_FIRST = [
  "Apex", "Basin", "Cobalt", "Drift", "Ember", "Fathom", "Garnet", "Harbor",
  "Iron Gate", "Juniper", "Keystone", "Lattice", "Meridian", "North Peak",
  "Outline", "Pinnacle", "Quarry", "Riverbed", "Summit", "Tidewater",
  "Umbra", "Vantage", "Westline", "Yellowpine", "Zephyr", "Anchor",
  "Bluffside", "Cinder", "Dunmore", "Eastvale", "Foxglove", "Granite",
  "Hollowell", "Inlet", "Kestrel", "Longford", "Marrow", "Northwind",
  "Oakline", "Palisade", "Quill", "Redmoor", "Stonebridge", "Thornfield",
  "Updraft", "Veridian", "Wharfside", "Axiom", "Bellweather", "Crestway",
];

const NAME_SECOND = [
  "Systems", "Labs", "Software", "Technologies", "Solutions", "Works",
  "Digital", "Data", "Cloud", "Logistics", "Health", "Commerce",
  "Platforms", "Networks", "Analytics", "Operations", "Industries",
  "Group", "Partners", "Dynamics",
];

function companyName(rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = `${pick(rng, NAME_FIRST)} ${pick(rng, NAME_SECOND)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  // Word lists give 1000 combinations for 500 customers; collisions resolve
  // long before this, but a numbered fallback keeps the function total.
  const fallback = `Vector ${used.size + 1} Systems`;
  used.add(fallback);
  return fallback;
}

function toDomain(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;
}

export function generateCustomers(seed: number, endDate: string): Customer[] {
  const rng = mulberry32(childSeed(seed, "customers"));
  const used = new Set<string>();
  const customers: Customer[] = [];
  let n = 0;

  for (const tier of PLAN_TIERS) {
    for (let i = 0; i < TIER_COUNTS[tier]; i++) {
      n++;
      const name = companyName(rng, used);
      const geography = weightedPick(rng, GEOGRAPHIES, GEO_WEIGHTS);
      const industry = weightedPick(rng, INDUSTRIES, INDUSTRY_WEIGHTS);

      // Signups spread over the trailing 36 months, denser recently.
      const ageDays = Math.floor(float(rng, 0, 1) ** 1.4 * 1080) + 14;
      const signup = addDays(endDate, -ageDays);

      const [mrrLo, mrrHi] = TIER_MRR[tier];
      const mrr = Math.round(float(rng, mrrLo, mrrHi) / 10) * 10;
      const [seatLo, seatHi] = TIER_SEATS[tier];

      // ~8% churned overall; the month-7 story is reinforced by events.ts.
      const churned = chance(rng, tier === "Starter" ? 0.11 : tier === "Growth" ? 0.06 : 0.03);
      const churnedAt = churned
        ? addDays(endDate, -int(rng, 5, Math.max(6, Math.min(ageDays - 1, 360))))
        : null;

      const churnRisk = churned
        ? 1
        : Math.min(0.95, Math.max(0.02, float(rng, 0, 0.6) + (tier === "Starter" ? 0.1 : 0)));

      customers.push({
        id: `c-${String(n).padStart(4, "0")}`,
        name,
        domain: toDomain(name),
        plan_tier: tier,
        geography,
        industry,
        signup_date: signup,
        status: churned ? "churned" : "active",
        mrr: churned ? 0 : mrr,
        seats: int(rng, seatLo, seatHi),
        owner_user_id: pick(rng, TEAM).id,
        churn_risk: Number(churnRisk.toFixed(2)),
        expansion_score: Number(
          (churned ? 0 : Math.min(0.95, float(rng, 0, tier === "Enterprise" ? 0.9 : 0.7))).toFixed(2),
        ),
        last_active_date: churned
          ? churnedAt
          : addDays(endDate, -int(rng, 0, 13)),
        churned_at: churnedAt,
      });
    }
  }

  return customers;
}

export interface CustomerMrrPoint {
  customer_id: string;
  month: string;
  mrr: number;
}

export interface CustomerUsagePoint {
  customer_id: string;
  date: string;
  active_users: number;
  api_calls: number;
}

/** 12 months of month-end MRR per customer plus 90 days of usage. */
export function generateCustomerSeries(
  seed: number,
  endDate: string,
  customers: Customer[],
): { mrrMonthly: CustomerMrrPoint[]; usageDaily: CustomerUsagePoint[] } {
  const rng = mulberry32(childSeed(seed, "customer-series"));
  const mrrMonthly: CustomerMrrPoint[] = [];
  const usageDaily: CustomerUsagePoint[] = [];

  for (const c of customers) {
    const baseMrr = c.status === "churned" ? float(rng, 50, 800) : c.mrr;
    // Walk MRR backwards from current with occasional step changes.
    let m = baseMrr;
    const months: number[] = [];
    for (let i = 0; i < 12; i++) {
      months.unshift(Math.max(0, Math.round(m)));
      if (chance(rng, 0.18)) m /= float(rng, 1.05, 1.35); // expansion happened
      else if (chance(rng, 0.06)) m *= float(rng, 1.05, 1.2); // contraction happened
    }
    for (let i = 0; i < 12; i++) {
      const monthDate = `${addDays(endDate, -(11 - i) * 30).slice(0, 7)}-01`;
      const churnedBefore =
        c.churned_at !== null && monthDate > c.churned_at;
      mrrMonthly.push({
        customer_id: c.id,
        month: monthDate,
        mrr: churnedBefore ? 0 : months[i],
      });
    }

    const baseUsers = Math.max(1, Math.round(c.seats * float(rng, 0.3, 0.8)));
    for (let d = 89; d >= 0; d--) {
      const date = addDays(endDate, -d);
      if (c.churned_at !== null && date > c.churned_at) {
        usageDaily.push({ customer_id: c.id, date, active_users: 0, api_calls: 0 });
        continue;
      }
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const weekend = dow === 0 || dow === 6 ? 0.35 : 1;
      const users = Math.max(0, Math.round(baseUsers * weekend * float(rng, 0.7, 1.25)));
      usageDaily.push({
        customer_id: c.id,
        date,
        active_users: users,
        api_calls: Math.round(users * float(rng, 5, 60)),
      });
    }
  }

  return { mrrMonthly, usageDaily };
}
