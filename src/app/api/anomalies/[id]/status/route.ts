import { NextResponse, type NextRequest } from "next/server";
import { openDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Mirrors the cookie name in src/middleware.ts (SESSION_COOKIE) and
// src/lib/portal-session.ts (LUMEN_SESSION_COOKIE). Duplicated here on
// purpose rather than imported, so this fix doesn't reach into those
// files while another agent is editing session/portal-handoff code in
// parallel.
const SESSION_COOKIE = "lumen_demo_session";

/*
  Anomaly triage moved client-side (M1 fix, 2026-09-19; per the
  anonymous-by-design direction in COUNCIL_COMPLIANCE_2026-09-19.md
  1.1/1.2). Every visitor's Acknowledge / Assign / Mark as false positive
  now lives in that browser's localStorage and is merged over the
  server-rendered rows at render time (src/lib/triage-overlay.ts). The
  shared `anomalies` table is seed data only, and this route no longer
  writes to it: middleware.ts only ever covered /app/*, so an
  unauthenticated POST here used to let any visitor or scanner dismiss
  the demo's anomaly story for every later visitor.

  The route still exists for two reasons: it 401s without the demo
  session cookie the same way /app/* does (a cheap scanner filter), and
  it gives an old client build that still POSTs here a clear response
  instead of a 404, without ever touching shared state.
*/
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }

  const params = await props.params;
  try {
    await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = openDb();
  const existing = db
    .prepare("SELECT id FROM anomalies WHERE id = ?")
    .get(params.id) as { id: string } | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Anomaly not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      deprecated: true,
      message:
        "Triage is per-visitor and client-side now; this endpoint no longer changes shared data.",
    },
    { status: 200 },
  );
}
