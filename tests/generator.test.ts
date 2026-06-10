import { describe, expect, it } from "vitest";
import { EMBEDDED_ANOMALIES } from "@/lib/data/anomaly-windows";
import { PLAN_TIERS, SEGMENT_DIMENSIONS } from "@/lib/data/catalog";
import { generateCustomers, generateCustomerSeries } from "@/lib/data/customers";
import { dateRange } from "@/lib/data/dates";
import { EVENT_COUNT, generateEvents } from "@/lib/data/events";
import { generateMetrics, WINDOW_DAYS, type MetricRow } from "@/lib/data/metrics";
import { childSeed, mulberry32 } from "@/lib/data/prng";

const SEED = 20260610;
const END = "2026-06-10";

describe("prng", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("derives distinct child streams per label", () => {
    expect(childSeed(1, "customers")).not.toBe(childSeed(1, "events"));
  });
});

describe("customers", () => {
  const customers = generateCustomers(SEED, END);

  it("generates exactly 500 customers in the 300/150/50 tier split", () => {
    expect(customers).toHaveLength(500);
    const byTier = Object.fromEntries(
      PLAN_TIERS.map((t) => [t, customers.filter((c) => c.plan_tier === t).length]),
    );
    expect(byTier).toEqual({ Starter: 300, Growth: 150, Enterprise: 50 });
  });

  it("gives every customer a unique id and name", () => {
    expect(new Set(customers.map((c) => c.id)).size).toBe(500);
    expect(new Set(customers.map((c) => c.name)).size).toBe(500);
  });

  it("is reproducible", () => {
    expect(generateCustomers(SEED, END)).toEqual(customers);
  });

  it("keeps churned customers consistent (no MRR, churn date set)", () => {
    for (const c of customers.filter((x) => x.status === "churned")) {
      expect(c.mrr).toBe(0);
      expect(c.churned_at).not.toBeNull();
    }
  });

  it("leaves enough Starter EMEA customers for the churn-spike story", () => {
    const pool = customers.filter(
      (c) => c.plan_tier === "Starter" && c.geography === "EMEA",
    );
    expect(pool.length).toBeGreaterThan(30);
  });
});

describe("customer series", () => {
  it("produces 12 monthly MRR points and 90 daily usage points per customer", () => {
    const customers = generateCustomers(SEED, END).slice(0, 20);
    const { mrrMonthly, usageDaily } = generateCustomerSeries(SEED, END, customers);
    expect(mrrMonthly).toHaveLength(20 * 12);
    expect(usageDaily).toHaveLength(20 * 90);
  });
});

describe("metrics", () => {
  const customers = generateCustomers(SEED, END);
  const rows = generateMetrics(SEED, END, customers);
  const dates = dateRange(END, WINDOW_DAYS);

  const top = (id: string): MetricRow[] =>
    rows
      .filter((r) => r.metric_id === id && r.segment_type === "all")
      .sort((a, b) => a.date.localeCompare(b.date));

  const slice = (id: string, dim: string, value: string): MetricRow[] =>
    rows
      .filter(
        (r) =>
          r.metric_id === id &&
          r.segment_type === dim &&
          r.segment_value === value,
      )
      .sort((a, b) => a.date.localeCompare(b.date));

  it("covers 365 days for every top-level metric", () => {
    const ids = new Set(rows.map((r) => r.metric_id));
    for (const id of ids) {
      expect(top(id), id).toHaveLength(WINDOW_DAYS);
    }
  });

  it("keeps additive slices summing to the top level on every dimension", () => {
    for (const id of ["mrr", "churned_mrr", "active_customers", "signups"]) {
      const topByDate = new Map(top(id).map((r) => [r.date, r.value]));
      for (const [dim, values] of Object.entries(SEGMENT_DIMENSIONS)) {
        for (const date of [dates[0], dates[180], dates[364]]) {
          const sum = values
            .map((v) => slice(id, dim, v).find((r) => r.date === date)!.value)
            .reduce((a, b) => a + b, 0);
          expect(sum, `${id} ${dim} ${date}`).toBeCloseTo(topByDate.get(date)!, 0);
        }
      }
    }
  });

  it("anchors final-day MRR and active customers to the customer list", () => {
    const activeMrr = customers
      .filter((c) => c.status === "active")
      .reduce((a, c) => a + c.mrr, 0);
    const activeCount = customers.filter((c) => c.status === "active").length;
    const lastMrr = top("mrr")[WINDOW_DAYS - 1].value;
    const lastActive = top("active_customers")[WINDOW_DAYS - 1].value;
    expect(Math.abs(lastMrr - activeMrr) / activeMrr).toBeLessThan(0.03);
    expect(Math.abs(lastActive - activeCount)).toBeLessThanOrEqual(activeCount * 0.03);
  });

  const windowMean = (series: MetricRow[], startDay: number, endDay: number): number => {
    const inWindow = series.slice(startDay, endDay + 1).map((r) => r.value);
    return inWindow.reduce((a, b) => a + b, 0) / inWindow.length;
  };

  /** Mean of the 45 days on each side of the window (5-day buffer), so
      long-run trend growth does not bias the lift ratio. */
  const localBaseline = (series: MetricRow[], startDay: number, endDay: number): number => {
    const outside = series
      .map((r, i) => ({ v: r.value, i }))
      .filter(
        ({ i }) =>
          (i >= startDay - 50 && i < startDay - 5) ||
          (i > endDay + 5 && i <= endDay + 50),
      )
      .map(({ v }) => v);
    return outside.reduce((a, b) => a + b, 0) / outside.length;
  };

  const lift = (series: MetricRow[], startDay: number, endDay: number): number =>
    windowMean(series, startDay, endDay) / localBaseline(series, startDay, endDay);

  it("embeds the month-7 churn spike concentrated in Starter and EMEA", () => {
    const a = EMBEDDED_ANOMALIES.find((x) => x.key === "churn-spike-m7")!;
    const starter = slice("churned_mrr", "plan_tier", "Starter");
    const emea = slice("churned_mrr", "geography", "EMEA");
    const enterprise = slice("churned_mrr", "plan_tier", "Enterprise");
    const topLevel = top("churned_mrr");

    expect(lift(starter, a.startDay, a.endDay)).toBeGreaterThan(1.4);
    expect(lift(emea, a.startDay, a.endDay)).toBeGreaterThan(1.5);
    // The spike must be visible on the top line (the dashboard chart) too.
    expect(lift(topLevel, a.startDay, a.endDay)).toBeGreaterThan(1.2);
    // The non-affected slice stays near baseline: that contrast is the
    // signal cause attribution ranks on.
    expect(lift(enterprise, a.startDay, a.endDay)).toBeLessThan(1.25);
  });

  it("embeds the month-9 expansion surge in Enterprise NA", () => {
    const a = EMBEDDED_ANOMALIES.find((x) => x.key === "expansion-surge-m9")!;
    const ent = slice("expansion_mrr", "plan_tier", "Enterprise");
    const topLevel = top("expansion_mrr");
    expect(lift(ent, a.startDay, a.endDay)).toBeGreaterThan(1.5);
    expect(lift(topLevel, a.startDay, a.endDay)).toBeGreaterThan(1.25);
  });

  it("embeds the month-11 API adoption drop in Growth tier", () => {
    const a = EMBEDDED_ANOMALIES.find((x) => x.key === "feature-adoption-drop-m11")!;
    const growth = slice("feature_adoption_api", "plan_tier", "Growth");
    const software = slice("feature_adoption_api", "industry", "Software");
    const topLevel = top("feature_adoption_api");
    expect(lift(growth, a.startDay, a.endDay)).toBeLessThan(0.88);
    expect(lift(software, a.startDay, a.endDay)).toBeLessThan(0.9);
    expect(lift(topLevel, a.startDay, a.endDay)).toBeLessThan(0.95);
  });

  it("derives ARR as MRR x 12", () => {
    const mrr = top("mrr");
    const arr = top("arr");
    for (const i of [0, 100, 364]) {
      expect(arr[i].value).toBeCloseTo(mrr[i].value * 12, 5);
    }
  });
});

describe("events", () => {
  const customers = generateCustomers(SEED, END);
  const events = generateEvents(SEED, END, customers);

  it("generates exactly 2000 events, time-ordered, within the window", () => {
    expect(events).toHaveLength(EVENT_COUNT);
    const sorted = [...events].sort((a, b) =>
      a.occurred_at.localeCompare(b.occurred_at),
    );
    expect(events).toEqual(sorted);
    expect(events[0].occurred_at >= "2025-06-11").toBe(true);
    expect(events[events.length - 1].occurred_at <= "2026-06-11").toBe(true);
  });

  it("references only real customers and carries valid JSON properties", () => {
    const ids = new Set(customers.map((c) => c.id));
    for (const e of events) {
      expect(ids.has(e.customer_id)).toBe(true);
      expect(() => JSON.parse(e.properties)).not.toThrow();
    }
  });

  it("clusters churn events in the month-7 window", () => {
    const churn = events.filter((e) => e.type === "churn");
    const inWindow = churn.filter(
      (e) => e.occurred_at >= "2025-12-13" && e.occurred_at <= "2026-01-01",
    );
    expect(inWindow.length / churn.length).toBeGreaterThan(0.35);
  });
});
