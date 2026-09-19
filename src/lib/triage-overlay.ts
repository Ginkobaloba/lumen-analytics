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

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse(raw: string | null): OverlayMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as OverlayMap) : {};
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

/** Forward-only transition rules, mirrored from the old server-side
    anomaly-actions.ts: acknowledge and assign both move `active` to
    `acknowledged`; false positive is terminal for the demo. Pure
    function, no I/O, so it is also the unit under test for the
    workflow rules. */
export function computeNextTriageState(
  current: { status: string; assignedTo: string | null },
  input: AnomalyTriageAction,
  team: TeamMemberLike[],
): { status: AnomalyStatus; assignedTo: string | null; assigneeName: string | null } | { error: string } {
  let status = current.status as AnomalyStatus;
  let assignedTo = current.assignedTo;

  switch (input.action) {
    case "acknowledge":
      status = "acknowledged";
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
