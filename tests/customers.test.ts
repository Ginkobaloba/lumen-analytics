import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createDb } from "@/lib/db";
import { seed } from "../scripts/seed";

const END = "2026-06-10";

/*
  queries.ts is server-only; setting LUMEN_DB_PATH before the dynamic
  import points its shared openDb() singleton at the test database.
  Detection is skipped: the customer pages read only seeded tables.
*/

describe("customer queries", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-customers-"));
  const dbPath = path.join(tmpDir, "test.db");
  let db: Database.Database;
  let getCustomersList: typeof import("@/lib/queries").getCustomersList;
  let getCustomerDetail: typeof import("@/lib/queries").getCustomerDetail;

  beforeAll(async () => {
    db = createDb(dbPath);
    seed(db, END);
    db.close();

    process.env.LUMEN_DB_PATH = dbPath;
    ({ getCustomersList, getCustomerDetail } = await import("@/lib/queries"));
  });

  afterAll(() => {
    delete process.env.LUMEN_DB_PATH;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort cleanup
    }
  });

  it("lists all 500 customers with owners, MRR-descending", () => {
    const customers = getCustomersList();
    expect(customers.length).toBe(500);

    for (let i = 1; i < customers.length; i++) {
      expect(customers[i - 1].mrr).toBeGreaterThanOrEqual(customers[i].mrr);
    }
    for (const c of customers.slice(0, 20)) {
      expect(c.owner_name.length).toBeGreaterThan(0);
      expect(["active", "churned"]).toContain(c.status);
    }
    // Churned customers carry zero MRR by construction.
    for (const c of customers.filter((x) => x.status === "churned")) {
      expect(c.mrr).toBe(0);
    }
  });

  it("returns the full detail payload for an active customer", () => {
    const first = getCustomersList()[0];
    const detail = getCustomerDetail(first.id)!;
    expect(detail).not.toBeNull();

    expect(detail.customer.id).toBe(first.id);
    expect(detail.owner.initials.length).toBeGreaterThan(0);

    // 12 ascending months of MRR history.
    expect(detail.mrrHistory.length).toBe(12);
    for (let i = 1; i < 12; i++) {
      expect(detail.mrrHistory[i - 1].month < detail.mrrHistory[i].month).toBe(true);
    }

    // 90 ascending days of usage ending at the dataset end date.
    expect(detail.usage.length).toBe(90);
    expect(detail.usage[89].date).toBe(END);
    for (const u of detail.usage) {
      expect(u.active_users).toBeGreaterThanOrEqual(0);
      expect(u.api_calls).toBeGreaterThanOrEqual(0);
    }

    // Events are parsed JSON, newest first.
    for (const e of detail.events) {
      expect(typeof e.properties).toBe("object");
    }
    for (let i = 1; i < detail.events.length; i++) {
      expect(detail.events[i - 1].occurred_at >= detail.events[i].occurred_at).toBe(true);
    }
  });

  it("zeroes usage and MRR after the churn date for churned customers", () => {
    const churned = getCustomersList().find((c) => c.status === "churned")!;
    const detail = getCustomerDetail(churned.id)!;

    expect(detail.customer.churned_at).not.toBeNull();
    const churnedAt = detail.customer.churned_at!;
    for (const u of detail.usage.filter((x) => x.date > churnedAt)) {
      expect(u.active_users).toBe(0);
      expect(u.api_calls).toBe(0);
    }
    for (const m of detail.mrrHistory.filter((x) => x.month > churnedAt)) {
      expect(m.mrr).toBe(0);
    }
  });

  it("returns null for unknown customer ids", () => {
    expect(getCustomerDetail("c-9999")).toBeNull();
  });
});
