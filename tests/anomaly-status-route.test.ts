import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createDb } from "@/lib/db";
import { runDetection } from "@/lib/ml/run-detection";
import { seed } from "../scripts/seed";
import { TEST_SECRET, hostileCookies, signSession } from "./helpers/session-tokens";

const END = "2026-06-10";
const SESSION_COOKIE = "lumen_demo_session";

/*
  M1: POST /api/anomalies/[id]/status needed no session (middleware.ts's
  matcher only ever covered /app/*), and used to UPDATE the one shared
  SQLite `anomalies` table -- any visitor or scanner could mark every
  anomaly "false positive" for every later visitor. The route no longer
  writes at all (triage moved client-side, see triage-overlay.test.ts);
  this file proves both halves of the fix: the route 401s without the
  demo session cookie, and the shared row never changes no matter what
  is POSTed, cookie or not.
*/
describe("POST /api/anomalies/[id]/status (M1)", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-status-route-"));
  const dbPath = path.join(tmpDir, "test.db");
  let anomalyId: string;
  let POST: typeof import("@/app/api/anomalies/[id]/status/route").POST;
  let validCookie: string;

  beforeAll(async () => {
    process.env.SESSION_SECRET = TEST_SECRET;
    validCookie = await signSession();
    const db = createDb(dbPath);
    seed(db, END);
    runDetection(db);
    anomalyId = (db.prepare("SELECT id FROM anomalies LIMIT 1").get() as { id: string }).id;
    db.close();

    process.env.LUMEN_DB_PATH = dbPath;
    ({ POST } = await import("@/app/api/anomalies/[id]/status/route"));
  });

  afterAll(() => {
    delete process.env.LUMEN_DB_PATH;
    delete process.env.SESSION_SECRET;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort cleanup
    }
  });

  async function readRow(): Promise<{ status: string; assigned_to: string | null; updated_at: string }> {
    const Database = (await import("better-sqlite3")).default;
    const reader = new Database(dbPath, { readonly: true });
    const row = reader
      .prepare("SELECT status, assigned_to, updated_at FROM anomalies WHERE id = ?")
      .get(anomalyId) as { status: string; assigned_to: string | null; updated_at: string };
    reader.close();
    return row;
  }

  it("rejects a request with no session cookie, and touches nothing", async () => {
    const before = await readRow();
    const req = new NextRequest(`http://0.0.0.0:3000/api/anomalies/${anomalyId}/status`, {
      method: "POST",
      body: JSON.stringify({ action: "false_positive" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: anomalyId }) });
    expect(res.status).toBe(401);
    expect(await readRow()).toEqual(before);
  });

  it("rejects every forged, tampered, expired, alg-none or unsigned cookie with 401, touching nothing", async () => {
    const before = await readRow();
    for (const [name, value] of Object.entries(await hostileCookies())) {
      const req = new NextRequest(`http://0.0.0.0:3000/api/anomalies/${anomalyId}/status`, {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${value}` },
        body: JSON.stringify({ action: "false_positive" }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: anomalyId }) });
      expect(res.status, name).toBe(401);
    }
    expect(await readRow()).toEqual(before);
  });

  it("fails closed with 500 misconfigured when SESSION_SECRET is short, even with a valid-looking cookie", async () => {
    process.env.SESSION_SECRET = "short";
    try {
      const req = new NextRequest(`http://0.0.0.0:3000/api/anomalies/${anomalyId}/status`, {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${validCookie}` },
        body: JSON.stringify({ action: "false_positive" }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: anomalyId }) });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "misconfigured" });
    } finally {
      process.env.SESSION_SECRET = TEST_SECRET;
    }
  });

  it("accepts a request with the session cookie but never mutates the shared row", async () => {
    const before = await readRow();
    const req = new NextRequest(`http://0.0.0.0:3000/api/anomalies/${anomalyId}/status`, {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${validCookie}` },
      body: JSON.stringify({ action: "false_positive" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: anomalyId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; deprecated: boolean };
    expect(body).toMatchObject({ ok: true, deprecated: true });
    // The whole point: a valid cookie is not a write permit. The shared
    // seed row is unchanged, same as the unauthenticated case above.
    expect(await readRow()).toEqual(before);
  });

  it("404s for an unknown id even with the cookie, writing nothing", async () => {
    const before = await readRow();
    const req = new NextRequest(`http://0.0.0.0:3000/api/anomalies/does-not-exist/status`, {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${validCookie}` },
      body: JSON.stringify({ action: "acknowledge" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(res.status).toBe(404);
    expect(await readRow()).toEqual(before);
  });

  it("400s on invalid JSON with the cookie present", async () => {
    const req = new NextRequest(`http://0.0.0.0:3000/api/anomalies/${anomalyId}/status`, {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${validCookie}` },
      body: "not json",
    });
    const res = await POST(req, { params: Promise.resolve({ id: anomalyId }) });
    expect(res.status).toBe(400);
  });
});
