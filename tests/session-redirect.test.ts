import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/session/route";

/**
 * Regression test for the "Open the live demo" redirect bug.
 *
 * Behind the demo reverse proxy, request.url's origin is the container's
 * internal bind address (0.0.0.0:3000). The old handler built the redirect
 * with new URL("/app", request.url), so the Location header shipped as
 * https://0.0.0.0:3000/app and the browser followed it to a dead host.
 *
 * The fix emits a path-relative Location, which the browser resolves against
 * the public address-bar origin. These tests construct the request with the
 * poisoned 0.0.0.0:3000 origin on purpose, so an absolute redirect would fail
 * them.
 */
describe("POST /api/session redirect", () => {
  it("sign-in returns a relative /app Location, never an absolute origin", async () => {
    const req = new NextRequest("http://0.0.0.0:3000/api/session", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/app");
    expect(res.headers.get("location")).not.toMatch(/^https?:\/\//);
    expect(res.headers.get("location")).not.toContain("0.0.0.0");
    expect(res.headers.get("set-cookie") ?? "").toContain("lumen_demo_session");
  });

  it("sign-out returns a relative / Location, never an absolute origin", async () => {
    const req = new NextRequest("http://0.0.0.0:3000/api/session?signout=1", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("location")).not.toMatch(/^https?:\/\//);
  });
});
