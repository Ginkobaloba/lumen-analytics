import { describe, expect, it, vi, afterEach } from "vitest";

/**
 * Tests for POST /api/alerts/slack
 *
 * Verifies session cookie requirement and rate limiting.
 */

function buildRequest(
  withCookie: boolean,
  ip?: string,
  anomalyId?: string,
): import("next/server").NextRequest {
  const { NextRequest } = require("next/server") as typeof import("next/server");
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  if (ip) {
    headers.set("x-forwarded-for", ip);
  }
  const req = new NextRequest("http://0.0.0.0:3000/api/alerts/slack", {
    method: "POST",
    headers,
    body: JSON.stringify({ anomalyId: anomalyId || "test-anomaly" }),
  });
  if (withCookie) {
    req.cookies.set("lumen_demo_session", "demo-token");
  }
  return req;
}

describe("POST /api/alerts/slack", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when session cookie is missing", async () => {
    const { POST } = await import("@/app/api/alerts/slack/route");
    const req = buildRequest(false, "192.168.1.1");

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "unauthorized" });
  });

  it("returns 429 on 6th request within 60 seconds from same IP", async () => {
    const { POST } = await import("@/app/api/alerts/slack/route");
    const clientIp = "192.168.1.100";

    // Mock the anomaly detail so requests don't fail for missing anomaly
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

    // Make 5 successful requests
    for (let i = 0; i < 5; i++) {
      const req = buildRequest(true, clientIp);
      const res = await POST(req);
      // First 5 should succeed (200 or other non-429 status)
      expect(res.status).not.toBe(429);
    }

    // 6th request should be rate limited
    const reqLimited = buildRequest(true, clientIp);
    const resLimited = await POST(reqLimited);
    expect(resLimited.status).toBe(429);
    const body = await resLimited.json();
    expect(body).toEqual({ error: "rate_limited" });
  });
});
