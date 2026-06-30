import "server-only";
import { TEAM } from "./data/catalog";
import { openDb } from "./db";

/*
  Anomaly workflow transitions for the demo: Acknowledge, Assign, and Mark
  as False Positive. Writes land in the container-layer SQLite and reset on
  redeploy, which is the agreed demo posture.
*/

export type AnomalyAction =
  | { action: "acknowledge" }
  | { action: "assign"; userId: string }
  | { action: "false_positive" };

export interface ActionResult {
  ok: boolean;
  error?: string;
  status?: string;
  assigned_to?: string | null;
  assignee_name?: string | null;
  updated_at?: string;
}

export function applyAnomalyAction(id: string, input: AnomalyAction): ActionResult {
  const db = openDb();
  const existing = db
    .prepare("SELECT id, status, assigned_to FROM anomalies WHERE id = ?")
    .get(id) as { id: string; status: string; assigned_to: string | null } | undefined;
  if (!existing) return { ok: false, error: "Anomaly not found" };

  let status = existing.status;
  let assignedTo = existing.assigned_to;

  switch (input.action) {
    case "acknowledge":
      status = "acknowledged";
      break;
    case "assign": {
      const user = TEAM.find((u) => u.id === input.userId);
      if (!user) return { ok: false, error: "Unknown team member" };
      assignedTo = user.id;
      if (status === "active") status = "acknowledged";
      break;
    }
    case "false_positive":
      status = "false_positive";
      break;
    default:
      return { ok: false, error: "Unknown action" };
  }

  const updatedAt = new Date().toISOString();
  db.prepare(
    "UPDATE anomalies SET status = ?, assigned_to = ?, updated_at = ? WHERE id = ?",
  ).run(status, assignedTo, updatedAt, id);

  return {
    ok: true,
    status,
    assigned_to: assignedTo,
    assignee_name: TEAM.find((u) => u.id === assignedTo)?.name ?? null,
    updated_at: updatedAt,
  };
}
