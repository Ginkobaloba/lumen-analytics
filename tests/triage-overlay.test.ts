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

  /*
    Deep-verify finding B1 (2026-09-19): the first version set
    `acknowledged` unconditionally on "acknowledge", so a visitor could
    take a `false_positive` or `resolved` anomaly back to `acknowledged`
    in one click, contradicting the docstring's "false positive is
    terminal". That mirrored the deleted server code exactly, which was
    never actually forward-only either. This pins the full allowed-
    transition table (4 starting statuses x 3 actions) so it can't
    regress silently again.
  */
  const ALL_STATUSES = ["active", "acknowledged", "resolved", "false_positive"] as const;

  it("acknowledge only ever moves active -> acknowledged; every other status is a no-op", () => {
    for (const status of ALL_STATUSES) {
      const result = computeNextTriageState({ status, assignedTo: null }, { action: "acknowledge" }, TEAM);
      if ("error" in result) throw new Error("unexpected error result");
      expect(result.status).toBe(status === "active" ? "acknowledged" : status);
      expect(result.assignedTo).toBeNull();
    }
  });

  it("assign always sets the owner; it only advances status when starting from active", () => {
    for (const status of ALL_STATUSES) {
      const result = computeNextTriageState(
        { status, assignedTo: null },
        { action: "assign", userId: "u-priya" },
        TEAM,
      );
      if ("error" in result) throw new Error("unexpected error result");
      expect(result.assignedTo).toBe("u-priya");
      expect(result.assigneeName).toBe("Priya Raghavan");
      expect(result.status).toBe(status === "active" ? "acknowledged" : status);
    }

    const bad = computeNextTriageState(
      { status: "active", assignedTo: null },
      { action: "assign", userId: "nope" },
      TEAM,
    );
    expect("error" in bad).toBe(true);
  });

  it("false_positive is reachable from every status", () => {
    for (const status of ALL_STATUSES) {
      const result = computeNextTriageState({ status, assignedTo: null }, { action: "false_positive" }, TEAM);
      if ("error" in result) throw new Error("unexpected error result");
      expect(result.status).toBe("false_positive");
    }
  });

  it("false_positive and resolved are terminal for status: acknowledge cannot reopen them", () => {
    for (const terminal of ["resolved", "false_positive"] as const) {
      const result = computeNextTriageState(
        { status: terminal, assignedTo: "u-dev" },
        { action: "acknowledge" },
        TEAM,
      );
      if ("error" in result) throw new Error("unexpected error result");
      expect(result.status).toBe(terminal);
      // Acknowledge is a status no-op; it does not touch the assignee.
      expect(result.assignedTo).toBe("u-dev");
    }
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

  it("is forward-only across repeated actions applied through the overlay", () => {
    useBrowser();
    const anomaly = { id: "an-fwd", status: "active", assigned_to: null };
    applyTriageAction(anomaly, { action: "acknowledge" }, TEAM);
    applyTriageAction(anomaly, { action: "assign", userId: "u-priya" }, TEAM);
    const result = applyTriageAction(anomaly, { action: "acknowledge" }, TEAM);
    if ("error" in result) throw new Error("unexpected error result");
    expect(result.status).toBe("acknowledged");
    expect(result.assignedTo).toBe("u-priya");

    // Now mark it false positive, then confirm acknowledge can never
    // bring it back (the exact bug in B1).
    applyTriageAction(anomaly, { action: "false_positive" }, TEAM);
    const afterFp = applyTriageAction(anomaly, { action: "acknowledge" }, TEAM);
    if ("error" in afterFp) throw new Error("unexpected error result");
    expect(afterFp.status).toBe("false_positive");
  });

  it("tolerates corrupt localStorage JSON instead of throwing", () => {
    const fake = useBrowser();
    fake.localStorage.setItem("lumen_triage_overlay_v1", "{not json");
    expect(readOverlay()).toEqual({});
    expect(() => applyOverlay({ id: "a1", status: "active", assigned_to: null })).not.toThrow();
  });

  it("treats non-object top-level JSON as an empty overlay instead of throwing", () => {
    const fake = useBrowser();
    for (const raw of ["[]", '"just a string"', "42", "null", "true"]) {
      fake.localStorage.setItem("lumen_triage_overlay_v1", raw);
      expect(readOverlay()).toEqual({});
      expect(() => applyOverlay({ id: "a1", status: "active", assigned_to: null })).not.toThrow();
    }
  });

  /*
    Deep-verify finding B2 (2026-09-19): an overlay entry with an object
    `assigneeName` reached a rendered prop and crashed /app/anomalies
    (React error #31), in both the table and the panel, and the crash
    survived reloads. Every entry is now validated field by field on
    read; a wrong-schema entry is dropped instead of rendered.
  */
  it("drops a wrong-schema overlay entry instead of crashing the render (B2)", () => {
    const fake = useBrowser();
    fake.localStorage.setItem(
      "lumen_triage_overlay_v1",
      JSON.stringify({
        // The exact shape that crashed the log and panel.
        "an-bad-object-name": {
          status: "acknowledged",
          assignedTo: null,
          assigneeName: { first: "Oops" },
          updatedAt: "2026-09-19T00:00:00Z",
        },
        "an-bad-status": { status: "not-a-real-status", assignedTo: null, assigneeName: null, updatedAt: "x" },
        "an-bad-assigned-number": { status: "active", assignedTo: 42, assigneeName: null, updatedAt: "x" },
        "an-bad-updatedat-number": { status: "active", assignedTo: null, assigneeName: null, updatedAt: 12345 },
        "an-bad-whole-array": ["not", "an", "entry"],
        "an-bad-whole-string": "just a string",
        "an-bad-whole-number": 12345,
        "an-bad-whole-null": null,
        // Otherwise-valid entry with unrecognized extra keys: tolerated.
        "an-ok-extra-keys": {
          status: "resolved",
          assignedTo: null,
          assigneeName: null,
          updatedAt: "2026-09-19T00:00:00Z",
          somethingElse: "field",
          another: 1,
        },
        "an-ok": {
          status: "acknowledged",
          assignedTo: "u-priya",
          assigneeName: "Priya Raghavan",
          updatedAt: "2026-09-19T00:00:00Z",
        },
      }),
    );

    const overlay = readOverlay();
    expect(Object.keys(overlay).sort()).toEqual(["an-ok", "an-ok-extra-keys"]);
    expect(overlay["an-ok-extra-keys"].status).toBe("resolved");

    const badIds = [
      "an-bad-object-name",
      "an-bad-status",
      "an-bad-assigned-number",
      "an-bad-updatedat-number",
      "an-bad-whole-array",
      "an-bad-whole-string",
      "an-bad-whole-number",
      "an-bad-whole-null",
    ];
    for (const id of badIds) {
      // A dropped entry falls back to the server (seed) row -- exactly
      // as if this browser had never triaged that anomaly -- never a
      // half-applied or garbage-shaped merge.
      const merged = applyOverlay({ id, status: "active", assigned_to: "seed-owner" });
      expect(merged).toEqual({ id, status: "active", assigned_to: "seed-owner" });
    }
    expect(() => applyOverlayToList(badIds.map((id) => ({ id, status: "active", assigned_to: null })))).not.toThrow();

    const mergedOk = applyOverlay<{
      id: string;
      status: string;
      assigned_to: string | null;
      assignee_name?: string | null;
    }>({ id: "an-ok", status: "active", assigned_to: null });
    expect(mergedOk.status).toBe("acknowledged");
    expect(mergedOk.assignee_name).toBe("Priya Raghavan");
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
