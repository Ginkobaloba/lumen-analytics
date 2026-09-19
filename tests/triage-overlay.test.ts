import { afterEach, describe, expect, it } from "vitest";
import {
  applyOverlay,
  applyOverlayToList,
  applyTriageAction,
  clearOverlay,
  computeNextTriageState,
  readOverlay,
} from "@/lib/triage-overlay";

/*
  M1 fix: POST /api/anomalies/[id]/status needed no session and wrote
  straight to the one shared SQLite `anomalies` table, so any visitor or
  scanner could mark every anomaly "false positive" for everyone else.
  Triage is per-visitor and client-side now (localStorage), merged over
  the server's seed rows at render time. These tests exercise the
  overlay module directly, simulating distinct visitors as distinct
  in-memory localStorage instances -- the actual isolation boundary a
  real browser provides.
*/

class FakeLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

class FakeWindow extends EventTarget {
  localStorage = new FakeLocalStorage();
}

const TEAM = [
  { id: "u-priya", name: "Priya Raghavan" },
  { id: "u-dev", name: "Dev Whoever" },
];

/** Stand in for "open a new browser": a fresh, empty localStorage. */
function useBrowser(): FakeWindow {
  const fake = new FakeWindow();
  (globalThis as { window?: unknown }).window = fake;
  return fake;
}

describe("triage-overlay (M1: per-visitor client-side triage)", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("computeNextTriageState mirrors the old server-side forward-only rules", () => {
    expect(
      computeNextTriageState({ status: "active", assignedTo: null }, { action: "acknowledge" }, TEAM),
    ).toMatchObject({ status: "acknowledged", assignedTo: null });

    // Assigning from active also advances status to acknowledged.
    expect(
      computeNextTriageState(
        { status: "active", assignedTo: null },
        { action: "assign", userId: "u-priya" },
        TEAM,
      ),
    ).toMatchObject({ status: "acknowledged", assignedTo: "u-priya", assigneeName: "Priya Raghavan" });

    // Assigning once already acknowledged/resolved doesn't move status.
    expect(
      computeNextTriageState(
        { status: "resolved", assignedTo: null },
        { action: "assign", userId: "u-priya" },
        TEAM,
      ),
    ).toMatchObject({ status: "resolved", assignedTo: "u-priya" });

    expect(
      computeNextTriageState({ status: "active", assignedTo: null }, { action: "false_positive" }, TEAM),
    ).toMatchObject({ status: "false_positive" });

    const bad = computeNextTriageState(
      { status: "active", assignedTo: null },
      { action: "assign", userId: "nope" },
      TEAM,
    );
    expect("error" in bad).toBe(true);
  });

  it("is a no-op outside the browser (SSR, no window)", () => {
    const anomaly = { id: "a1", status: "active", assigned_to: null };
    expect(applyOverlay(anomaly)).toEqual(anomaly);
    expect(applyOverlayToList([anomaly])).toEqual([anomaly]);
    expect(readOverlay()).toEqual({});
  });

  it("persists an action for the visitor who did it, and their own next read reflects it", () => {
    useBrowser();
    const anomaly = { id: "an-1", status: "active", assigned_to: null };

    const result = applyTriageAction(anomaly, { action: "acknowledge" }, TEAM);
    if ("error" in result) throw new Error("unexpected error result");
    expect(result.status).toBe("acknowledged");

    // The visitor's own next read (reopening the panel, the log table
    // re-rendering) sees the triage merged over the seed row.
    const merged = applyOverlay(anomaly);
    expect(merged.status).toBe("acknowledged");
    // The object the server sent down is never mutated in place.
    expect(anomaly.status).toBe("active");

    const list = applyOverlayToList([anomaly, { id: "an-2", status: "active", assigned_to: null }]);
    expect(list[0].status).toBe("acknowledged");
    expect(list[1].status).toBe("active");
  });

  it("never lets one visitor's triage reach another visitor's browser", () => {
    const anomaly = { id: "an-shared", status: "active", assigned_to: null };

    const visitorA = useBrowser();
    applyTriageAction(anomaly, { action: "false_positive" }, TEAM);
    expect(applyOverlay(anomaly).status).toBe("false_positive");

    // A second visitor is a second browser: a distinct, empty
    // localStorage. This is the actual isolation boundary in production;
    // there is no shared store to leak through.
    const visitorB = useBrowser();
    expect(visitorB).not.toBe(visitorA);
    expect(readOverlay()).toEqual({});
    expect(applyOverlay(anomaly).status).toBe("active");

    // A "fresh client" (cleared storage) reads the same as visitor B.
    visitorB.localStorage.clear();
    expect(applyOverlay(anomaly).status).toBe("active");
  });

  it("is forward-only across repeated actions, same as the old server rule", () => {
    useBrowser();
    const anomaly = { id: "an-fwd", status: "active", assigned_to: null };
    applyTriageAction(anomaly, { action: "acknowledge" }, TEAM);
    applyTriageAction(anomaly, { action: "assign", userId: "u-priya" }, TEAM);
    const result = applyTriageAction(anomaly, { action: "acknowledge" }, TEAM);
    if ("error" in result) throw new Error("unexpected error result");
    expect(result.status).toBe("acknowledged");
    expect(result.assignedTo).toBe("u-priya");
  });

  it("tolerates corrupt localStorage JSON instead of throwing", () => {
    const fake = useBrowser();
    fake.localStorage.setItem("lumen_triage_overlay_v1", "{not json");
    expect(readOverlay()).toEqual({});
    expect(() => applyOverlay({ id: "a1", status: "active", assigned_to: null })).not.toThrow();
  });

  it("clearOverlay wipes this browser's triage back to seed", () => {
    useBrowser();
    const anomaly = { id: "an-clear", status: "active", assigned_to: null };
    applyTriageAction(anomaly, { action: "acknowledge" }, TEAM);
    expect(applyOverlay(anomaly).status).toBe("acknowledged");
    clearOverlay();
    expect(applyOverlay(anomaly).status).toBe("active");
  });
});
