import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { POST as sessionPOST } from "@/app/api/session/route";
import { verifyLumenSession } from "@/lib/portal-session";
import { COOKIE, TEST_SECRET, hostileCookies, signSession } from "./helpers/session-tokens";

/*
  L1: the /app gate used to check only that a cookie named
  lumen_demo_session EXISTED, and /api/session set it to the literal
  "demo-user". These tests pin the fix: the middleware verifies a signed
  HS256 session (jti, iat, exp), and /api/session mints one.
*/

function appRequest(cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", `${COOKIE}=${cookie}`);
  return new NextRequest("http://0.0.0.0:3000/app/anomalies", { headers });
}

function isPassThrough(res: Response): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

function isSigninRedirect(res: Response): boolean {
  const location = res.headers.get("location") ?? "";
  return res.status === 307 && location.includes("/?signin=required");
}

function cookieFrom(res: Response): string {
  const match = (res.headers.get("set-cookie") ?? "").match(
    new RegExp(`${COOKIE}=([^;]*)`),
  );
  return match ? match[1] : "";
}

beforeEach(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("middleware on /app/*", () => {
  it("redirects when no session cookie is sent", async () => {
    const res = await middleware(appRequest());
    expect(isSigninRedirect(res)).toBe(true);
  });

  it("passes a valid signed session through", async () => {
    const res = await middleware(appRequest(await signSession()));
    expect(isPassThrough(res)).toBe(true);
  });

  it("rejects every hostile cookie value and clears the cookie", async () => {
    const cases = await hostileCookies();
    for (const [name, value] of Object.entries(cases)) {
      const res = await middleware(appRequest(value));
      expect(isSigninRedirect(res), name).toBe(true);
      expect(isPassThrough(res), name).toBe(false);
      if (value !== "") {
        // The bad cookie is deleted on the way out (empty value, expired).
        expect(res.headers.get("set-cookie") ?? "", name).toContain(`${COOKIE}=;`);
      }
    }
  });

  it("fails closed when SESSION_SECRET is missing, even for a well-formed token", async () => {
    const token = await signSession();
    delete process.env.SESSION_SECRET;
    const res = await middleware(appRequest(token));
    expect(isSigninRedirect(res)).toBe(true);
  });

  it("fails closed when SESSION_SECRET is short, even for a token signed with that short secret", async () => {
    const short = "too-short-secret";
    process.env.SESSION_SECRET = short;
    const token = await signSession({}, { secret: short });
    const res = await middleware(appRequest(token));
    expect(isSigninRedirect(res)).toBe(true);
  });
});

describe("POST /api/session mints a real signed session", () => {
  it("sets a compact HS256 JWT carrying jti, iat and exp that the middleware accepts", async () => {
    const res = await sessionPOST(
      new NextRequest("http://0.0.0.0:3000/api/session", { method: "POST" }),
    );
    expect(res.status).toBe(303);
    const token = cookieFrom(res);
    expect(token).not.toBe("demo-user");
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    expect(header.alg).toBe("HS256");

    const payload = await verifyLumenSession(token);
    expect(payload).not.toBeNull();
    expect(payload?.src).toBe("demo");
    expect(typeof payload?.jti).toBe("string");
    expect(payload?.jti.length).toBeGreaterThan(0);
    expect(payload!.exp - payload!.iat).toBe(3600);

    // Cookie lifetime matches the token lifetime, and the cookie is HttpOnly.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("expires=");

    expect(isPassThrough(await middleware(appRequest(token)))).toBe(true);
  });

  it("mints a fresh jti on every sign-in", async () => {
    const mint = async () =>
      cookieFrom(
        await sessionPOST(new NextRequest("http://0.0.0.0:3000/api/session", { method: "POST" })),
      );
    const a = await verifyLumenSession(await mint());
    const b = await verifyLumenSession(await mint());
    expect(a?.jti).toBeTruthy();
    expect(a?.jti).not.toBe(b?.jti);
  });

  it.each([
    ["missing", undefined],
    ["short", "only-31-characters-long-secret!"],
  ])("fails closed with 500 misconfigured when SESSION_SECRET is %s", async (_label, secret) => {
    if (secret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = secret;
    const res = await sessionPOST(
      new NextRequest("http://0.0.0.0:3000/api/session", { method: "POST" }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "misconfigured" });
    expect(res.headers.get("set-cookie") ?? "").not.toContain(COOKIE);
  });
});
