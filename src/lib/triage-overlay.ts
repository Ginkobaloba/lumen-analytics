/*
  Per-visitor anomaly triage overlay (M1 fix, 2026-09-19).

  The shared `anomalies` table is seed data only -- nothing ever writes to
  it again after `npm run detect`. Each browser keeps its own triage
  (Acknowledge, Assign, Mark as false positive) in localStorage and merges
  it over the server-rendered anomaly rows at render time. One visitor's
  clicks never touch another visitor's view, and a fresh client (or a
  cleared localStorage) always sees the seed story.

  No "server-only" here on purpose: this module runs in the browser. It is
  written to be safe to import (a no-op) anywhere `window` is unavailable,
  so component files can still import it during SSR without guarding
  every call site.
*/

export type AnomalyStatus = "active" | "acknowledged" | "resolved" | "false_positive";

export interface TriageOverlayEntry {
  status: AnomalyStatus;
  assignedTo: string | null;
  assigneeName: string | null;
  updatedAt: string;
}

export type AnomalyTriageAction =
  | { action: "acknowledge" }
  | { action: "assign"; userId: string }
  | { action: "false_positive" };

export interface TeamMemberLike {
  id: string;
  name: string;
}

type OverlayMap = Record<string, TriageOverlayEntry>;

const STORAGE_KEY = "lumen_triage_overlay_v1";
const CHANGE_EVENT = "lumen-triage-overlay-change";
const VALID_STATUSES: readonly AnomalyStatus[] = [
  "active",
  "acknowledged",
  "resolved",
  "false_positive",
];

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Field-by-field validation for one overlay entry (deep-verify finding
    B2, 2026-09-19: an entry with e.g. an object `assigneeName` reached a
    rendered prop and crashed the anomaly log with React error #31). An
    entry that isn't a plain object, or whose known fields aren't the
    right type or value, is invalid. Unrecognized extra keys are
    tolerated and ignored -- only the four known fields are checked. */
function isValidOverlayEntry(value: unknown): value is TriageOverlayEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.status !== "string" || !VALID_STATUSES.includes(v.status as AnomalyStatus)) {
    return false;
  }
  if (v.assignedTo !== null && typeof v.assignedTo !== "string") return false;
  if (v.assigneeName !== null && typeof v.assigneeName !== "string") return false;
  if (typeof v.updatedAt !== "string") return false;
  return true;
}

/** Parse the raw storage string into an overlay map, dropping any entry
    that fails validation. Never throws: invalid JSON, a non-object top
    level (array, string, number, null), and per-entry schema violations
    all resolve to an empty or partial map instead of reaching a caller. */
function safeParse(raw: string | null): OverlayMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    // Object.create(null): a key literally named "__proto__" in the
    // stored JSON must not reach Object.prototype's setter and change
    // this map's own prototype chain.
    const result: OverlayMap = Object.create(null) as OverlayMap;
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidOverlayEntry(entry)) result[id] = entry;
      // A wrong-schema entry is dropped silently: the anomaly it names
      // just renders as its server (seed) row, same as if this browser
      // had never triaged it.
    }
    return result;
  } catch {
    return {};
  }
}

/** Read this browser's full overlay map. Returns {} outside the browser,
    with no localStorage, or on any parse failure (private browsing,
    corrupted JSON). Never throws. */
export function readOverlay(): OverlayMap {
  if (!hasWindow()) return {};
  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeOverlay(map: OverlayMap): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Private browsing / storage quota: the in-memory state the caller
    // already applied still renders correctly for this session, it just
    // won't survive a reload. Not worth surfacing to the visitor.
  }
}

/** Subscribe to overlay changes: same-tab writes (custom event) and
    other tabs of the same browser (native `storage` event). Returns an
    unsubscribe function; a no-op outside the browser. */
export function subscribeToOverlayChanges(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

interface AnomalyLike {
  id: string;
  status: string;
  assigned_to: string | null;
  assignee_name?: string | null;
  updated_at?: string;
}

// Entries reaching here always came through safeParse()'s
// isValidOverlayEntry check (readOverlay is the only way into this
// module's map), so no further validation happens at merge time.
function mergeEntry<T extends AnomalyLike>(anomaly: T, entry: TriageOverlayEntry | undefined): T {
  if (!entry) return anomaly;
  return {
    ...anomaly,
    status: entry.status,
    assigned_to: entry.assignedTo,
    assignee_name: entry.assigneeName,
    updated_at: entry.updatedAt,
  } as T;
}

/** Merge this browser's overlay over one server-rendered anomaly. The
    shared row itself is never mutated; this only changes what renders. */
export function applyOverlay<T extends AnomalyLike>(anomaly: T): T {
  return mergeEntry(anomaly, readOverlay()[anomaly.id]);
}

/** Merge this browser's overlay over a list of server-rendered
    anomalies (the log table, the recent-anomalies feed, per-metric
    lists, chart markers). */
export function applyOverlayToList<T extends AnomalyLike>(anomalies: T[]): T[] {
  const overlay = readOverlay();
  if (Object.keys(overlay).length === 0) return anomalies;
  return anomalies.map((a) => mergeEntry(a, overlay[a.id]));
}

/**
 * Forward-only transition rules for the three client-side triage
 * actions. Full table (deep-verify finding B1, 2026-09-19: the first
 * version set `acknowledged` unconditionally, so Acknowledge could move
 * a `false_positive` or `resolved` anomaly backward into acknowledged --
 * exactly the deleted server code's behavior, which was never actually
 * forward-only either, despite this module's original docstring saying
 * so):
 *
 *   action \ current    active        acknowledged   resolved   false_positive
 *   acknowledge         -> acknowledged  no-op         no-op       no-op
 *   assign              -> acknowledged  no-op*        no-op*      no-op*
 *   false_positive      -> false_positive -> false_positive -> false_positive -> false_positive
 *
 *   * assign always sets `assignedTo` regardless of status; the "no-op"
 *     above is about `status` only -- assigning an investigator to an
 *     already-triaged anomaly changes who owns it without reopening it.
 *
 * Acknowledge is intentionally not a way to undo a false positive or
 * reopen a resolved anomaly: it is a no-op on every status except
 * `active`. Pure function, no I/O, so it is also the unit under test for
 * the workflow rules (see the transition-table test in
 * tests/triage-overlay.test.ts).
 */
export function computeNextTriageState(
  current: { status: string; assignedTo: string | null },
  input: AnomalyTriageAction,
  team: TeamMemberLike[],
): { status: AnomalyStatus; assignedTo: string | null; assigneeName: string | null } | { error: string } {
  let status = current.status as AnomalyStatus;
  let assignedTo = current.assignedTo;

  switch (input.action) {
    case "acknowledge":
      if (status === "active") status = "acknowledged";
      break;
    case "assign": {
      const user = team.find((u) => u.id === input.userId);
      if (!user) return { error: "Unknown team member" };
      assignedTo = user.id;
      if (status === "active") status = "acknowledged";
      break;
    }
    case "false_positive":
      status = "false_positive";
      break;
    default:
      return { error: "Unknown action" };
  }

  const assigneeName = assignedTo ? (team.find((u) => u.id === assignedTo)?.name ?? null) : null;
  return { status, assignedTo, assigneeName };
}

/** Apply one triage action for this visitor: compute the next state from
    the server row merged with any existing overlay entry, persist it to
    localStorage, and return the persisted entry. Never touches the
    server or any other visitor's browser. */
export function applyTriageAction(
  anomaly: { id: string; status: string; assigned_to: string | null },
  input: AnomalyTriageAction,
  team: TeamMemberLike[],
): TriageOverlayEntry | { error: string } {
  const overlay = readOverlay();
  const existing = overlay[anomaly.id];
  const current = existing
    ? { status: existing.status, assignedTo: existing.assignedTo }
    : { status: anomaly.status, assignedTo: anomaly.assigned_to };

  const next = computeNextTriageState(current, input, team);
  if ("error" in next) return next;

  const entry: TriageOverlayEntry = {
    status: next.status,
    assignedTo: next.assignedTo,
    assigneeName: next.assigneeName,
    updatedAt: new Date().toISOString(),
  };
  writeOverlay({ ...overlay, [anomaly.id]: entry });
  return entry;
}

/** Wipe this browser's triage overlay: every anomaly renders as seed
    again. Exported for tests and any future "reset my triage"
    affordance; not wired to any UI today. */
export function clearOverlay(): void {
  writeOverlay({});
}
