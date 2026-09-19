import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { COOKIE, TEST_SECRET, hostileCookies, signSession } from "./helpers/session-tokens";

/**
 * Tests for POST /api/alerts/slack.
 *
 * L1: the route requires a VALID signed session, not merely a cookie.
 * W8: a per-client limit (2/min keyed on CF-Connecting-IP) on top of the
 * global 5/min ceiling; no CF-Connecting-IP means global only;
 * X-Forwarded-For is never read.
 *
 * vi.resetModules() before each test gives each one a fresh module-level
 * limiter; the anomaly lookup is mocked BEFORE the route is imported so
 * admitted calls return 200.
 */

async function loadRoute() {
  vi.doMock("@/lib/anomaly-detail", () => ({
    getAnomalyDetail: () => ({
      id: "an-test",
      title: "Test",
      summary: "Test summary",
      severity: "low",
      metric: { name: "Test Metric" },
      date: "2026-01-01",
      end_date: null,
      sigma: 2.5,
      contributors: [],
      affected: null,
    }),
  }));
  return import("@/app/api/alerts/slack/route");
}

async function buildRequest(
  opts: { cookie?: string | null; cfIp?: string; xff?: string } = {},
): Promise<NextRequest> {
  const { NextRequest } = await import("next/server");
  const headers = new Headers({ "Content-Type": "application/json" });
  if (opts.cfIp) headers.set("cf-connecting-ip", opts.cfIp);
  if (opts.xff) headers.set("x-forwarded-for", opts.xff);
  const cookie = opts.cookie === undefined ? await signSession() : opts.cookie;
  if (cookie !== null) headers.set("cookie", `${COOKIE}=${cookie}`);
  return new NextRequest("http://0.0.0.0:3000/api/alerts/slack", {
    method: "POST",
    headers,
    body: JSON.stringify({ anomalyId: "an-test" }),
  });
}

beforeEach(() => {
  vi.resetModules();
  process.env.SESSION_SECRET = TEST_SECRET;
  delete process.env.LUMEN_SLACK_WEBHOOK_URL;
});

afterEach(() => {
  vi.doUnmock("@/lib/anomaly-detail");
  vi.clearAllMocks();
  delete process.env.SESSION_SECRET;
});

describe("POST /api/alerts/slack: session", () => {
  it("returns 401 when the session cookie is missing", async () => {
    const { POST } = await loadRoute();
    const res = await POST(await buildRequest({ cookie: null, cfIp: "203.0.113.1" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 for every forged, tampered, expired, alg-none or unsigned cookie", async () => {
    const { POST } = await loadRoute();
    for (const [name, value] of Object.entries(await hostileCookies())) {
      const res = await POST(await buildRequest({ cookie: value }));
      expect(res.status, name).toBe(401);
    }
  });

  it("hostile cookies never consume rate-limit budget", async () => {
    const { POST } = await loadRoute();
    for (let i = 0; i < 10; i++) {
      await POST(await buildRequest({ cookie: "demo-user", cfIp: "203.0.113.9" }));
    }
    const res = await POST(await buildRequest({ cfIp: "203.0.113.9" }));
    expect(res.status).toBe(200);
  });

  it("accepts a valid signed session", async () => {
    const { POST } = await loadRoute();
    const res = await POST(await buildRequest({ cfIp: "203.0.113.1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("payload");
  });

  it("fails closed with 500 misconfigured when SESSION_SECRET is missing", async () => {
    const cookie = await signSession();
    delete process.env.SESSION_SECRET;
    const { POST } = await loadRoute();
    const res = await POST(await buildRequest({ cookie }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "misconfigured" });
  });
});

describe("POST /api/alerts/slack: per-client and global limits", () => {
  it("returns 429 on the 3rd call from the same CF-Connecting-IP", async () => {
    const { POST } = await loadRoute();
    for (let i = 0; i < 2; i++) {
      const res = await POST(await buildRequest({ cfIp: "198.51.100.7" }));
      expect(res.status).toBe(200);
    }
    const limited = await POST(await buildRequest({ cfIp: "198.51.100.7" }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });

    // Another client is unaffected by that client's exhausted window.
    const other = await POST(await buildRequest({ cfIp: "198.51.100.8" }));
    expect(other.status).toBe(200);
  });

  it("rotating X-Forwarded-For does not reset the per-client window", async () => {
    const { POST } = await loadRoute();
    for (let i = 0; i < 2; i++) {
      const res = await POST(await buildRequest({ cfIp: "198.51.100.7", xff: `10.9.9.${i}` }));
      expect(res.status).toBe(200);
    }
    const limited = await POST(await buildRequest({ cfIp: "198.51.100.7", xff: "10.9.9.99" }));
    expect(limited.status).toBe(429);
  });

  it("returns 429 on the 6th call overall across rotating CF-Connecting-IPs", async () => {
    const { POST } = await loadRoute();
    const ips = ["192.0.2.1", "192.0.2.2", "192.0.2.3"];
    // 3 clients x 2 calls = 6 calls, each client within its own limit; the
    // first 5 are admitted and the 6th trips the global ceiling.
    const statuses: number[] = [];
    for (const ip of ips) {
      for (let i = 0; i < 2; i++) {
        statuses.push((await POST(await buildRequest({ cfIp: ip }))).status);
      }
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);

    // A brand-new client is still held by the global ceiling.
    const fresh = await POST(await buildRequest({ cfIp: "192.0.2.200" }));
    expect(fresh.status).toBe(429);
  });

  it("without CF-Connecting-IP, falls back to the global limit only (5 admitted, 6th is 429)", async () => {
    const { POST } = await loadRoute();
    for (let i = 0; i < 5; i++) {
      const res = await POST(await buildRequest());
      expect(res.status).toBe(200);
    }
    const limited = await POST(await buildRequest());
    expect(limited.status).toBe(429);
  });

  it("without CF-Connecting-IP, X-Forwarded-For is ignored: rotating it never buys a fresh bucket", async () => {
    const { POST } = await loadRoute();
    for (let i = 0; i < 5; i++) {
      const res = await POST(await buildRequest({ xff: `10.9.9.${i}` }));
      expect(res.status).toBe(200);
    }
    const limited = await POST(await buildRequest({ xff: "10.9.9.99" }));
    expect(limited.status).toBe(429);
  });

  it("XFF alone never creates a per-client limit (3 calls with one XFF value all pass)", async () => {
    const { POST } = await loadRoute();
    for (let i = 0; i < 3; i++) {
      const res = await POST(await buildRequest({ xff: "10.1.1.1" }));
      expect(res.status).toBe(200);
    }
  });
});
