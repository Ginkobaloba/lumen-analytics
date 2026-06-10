import type { Customer } from "./customers";
import { addDays } from "./dates";
import { childSeed, chance, int, mulberry32, pick, weightedPick, type Rng } from "./prng";

export interface DemoEvent {
  customer_id: string;
  type: string;
  occurred_at: string;
  properties: string;
}

export const EVENT_COUNT = 2000;

const EVENT_TYPES = [
  "login",
  "signup",
  "activation",
  "upgrade",
  "downgrade",
  "expansion",
  "churn",
  "support_ticket",
] as const;

/* Logins dominate, the rest follow a plausible lifecycle distribution. */
const EVENT_WEIGHTS = [0.52, 0.08, 0.07, 0.05, 0.025, 0.055, 0.03, 0.17];

const FEATURES = ["dashboards", "alerts", "reports", "api", "funnels", "cohorts"];
const TICKET_TOPICS = ["billing", "data-sync", "permissions", "api-limits", "onboarding", "export"];

function timestamp(rng: Rng, date: string): string {
  // Business-hours weighted clock time.
  const hour = Math.min(23, Math.max(0, Math.round(13 + (rng() - 0.5) * 12)));
  return `${date}T${String(hour).padStart(2, "0")}:${String(int(rng, 0, 59)).padStart(2, "0")}:${String(int(rng, 0, 59)).padStart(2, "0")}Z`;
}

export function generateEvents(
  seed: number,
  endDate: string,
  customers: Customer[],
): DemoEvent[] {
  const rng = mulberry32(childSeed(seed, "events"));
  const active = customers.filter((c) => c.status === "active");
  const churned = customers.filter((c) => c.status === "churned");
  const starterEmea = customers.filter(
    (c) => c.plan_tier === "Starter" && c.geography === "EMEA",
  );
  const enterpriseNa = active.filter(
    (c) => c.plan_tier === "Enterprise" && c.geography === "NA",
  );
  const events: DemoEvent[] = [];

  while (events.length < EVENT_COUNT) {
    const type = weightedPick(rng, EVENT_TYPES, EVENT_WEIGHTS);
    // Recency-skewed day offset across the 12-month window.
    let day = Math.floor((1 - rng() ** 1.6) * 364);

    let customer: Customer;
    let properties: Record<string, unknown> = {};

    switch (type) {
      case "churn": {
        // Cluster churn in the month-7 anomaly window, Starter EMEA heavy.
        if (chance(rng, 0.55) && starterEmea.length > 0) {
          customer = pick(rng, starterEmea);
          day = 364 - int(rng, 186, 204);
        } else {
          customer = churned.length > 0 ? pick(rng, churned) : pick(rng, customers);
        }
        properties = { reason: pick(rng, ["price", "low-usage", "missing-feature", "consolidation"]) };
        break;
      }
      case "expansion":
      case "upgrade": {
        // Cluster expansion in the month-9 surge, Enterprise NA heavy.
        if (chance(rng, 0.45) && enterpriseNa.length > 0) {
          customer = pick(rng, enterpriseNa);
          day = 364 - int(rng, 247, 261);
        } else {
          customer = pick(rng, active);
        }
        properties = { added_seats: int(rng, 2, 40), added_mrr: int(rng, 5, 120) * 10 };
        break;
      }
      case "signup": {
        customer = pick(rng, customers);
        properties = { source: pick(rng, ["organic", "paid-search", "referral", "outbound", "event"]) };
        break;
      }
      case "activation": {
        customer = pick(rng, customers);
        properties = { milestone: "first-dashboard-shared" };
        break;
      }
      case "support_ticket": {
        customer = pick(rng, active);
        properties = { topic: pick(rng, TICKET_TOPICS), priority: pick(rng, ["low", "normal", "high"]) };
        break;
      }
      case "downgrade": {
        customer = pick(rng, active);
        properties = { removed_mrr: int(rng, 2, 40) * 10 };
        break;
      }
      default: {
        customer = pick(rng, active);
        properties = { feature: pick(rng, FEATURES) };
      }
    }

    const date = addDays(endDate, -day);
    events.push({
      customer_id: customer.id,
      type,
      occurred_at: timestamp(rng, date),
      properties: JSON.stringify(properties),
    });
  }

  events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return events;
}
