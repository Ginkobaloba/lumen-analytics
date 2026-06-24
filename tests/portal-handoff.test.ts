import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";

/**
 * Integration test for POST /api/portal/handoff.
 *
 * We stand up a fake JWKS in memory, point the route at it via env vars,
 * then exercise the route directly with NextRequest. Because the route's
 * verifier hits the network for real JWKS in production, we stub global
 * fetch in the test to return our in-memory key set; the route exercises
 * the real verifier code path including the in-process cache.
 */

const ISSUER = "https://portal.test.local";
const AUDIENCE = "lumenanalytics";
const JWKS_URL = "https://portal.test.local/.well-known/jwks.json";

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

interface KeyMaterial {
  privateKey: SigningKey;
  jwk: JWK;
}

async function makeKey(kid: string): Promise<KeyMaterial> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  jwk.kid = kid;
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwk };
}

async function mintToken(
  key: KeyMaterial,
  overrides: {
    sub?: string;
    aud?: string;
    iss?: string;
    iat?: number;
    exp?: number;
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ customer_id: "cust-9", role: "internal" })
    .setProtectedHeader({ alg: "RS256", kid: key.jwk.kid as string, typ: "JWT" })
    .setIssuedAt(overrides.iat ?? now)
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? AUDIENCE)
    .setSubject(overrides.sub ?? "demo.user@example.com")
    .setExpirationTime(overrides.exp ?? now + 60)
    .sign(key.privateKey);
}

function installJwksFetch(jwks: JWK[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === JWKS_URL) {
        return new Response(JSON.stringify({ keys: jwks }), {
          status: 200,
          headers: { "Content-Type": "application/jwk-set+json" },
        });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

function buildRequest(token: unknown): import("next/server").NextRequest {
  const { NextRequest } = require("next/server") as typeof import("next/server");
  return new NextRequest("http://0.0.0.0:3000/api/portal/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token === undefined ? {} : { token }),
  });
}

beforeEach(() => {
  process.env.PORTAL_JWKS_URL = JWKS_URL;
  process.env.PORTAL_EXPECTED_ISSUER = ISSUER;
  process.env.PORTAL_EXPECTED_AUD = AUDIENCE;
  process.env.SESSION_SECRET = "a".repeat(48);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.PORTAL_JWKS_URL;
  delete process.env.PORTAL_EXPECTED_ISSUER;
  delete process.env.PORTAL_EXPECTED_AUD;
  delete process.env.SESSION_SECRET;
});

async function loadRouteFresh() {
  const mod = await import("@/app/api/portal/handoff/route");
  const helpers = await import("@/lib/portal-jwks");
  helpers._resetJwksCacheForTests();
  return mod;
}

describe("POST /api/portal/handoff", () => {
  it("verifies a valid portal token, sets the demo cookie with a signed JWT, returns /app redirect target", async () => {
    const key = await makeKey("active-1");
    installJwksFetch([key.jwk]);
    // Use mixed-case email to assert sub is lowercased in the session JWT.
    const token = await mintToken(key, { sub: "Drew@Example.com" });
    const { POST } = await loadRouteFresh();

    const res = await POST(buildRequest(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      redirect: "/app",
      subject: "Drew@Example.com",
      customer_id: "cust-9",
      role: "internal",
    });

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("lumen_demo_session");

    // Cookie value must be a compact JWT (three dot-separated base64url parts).
    const cookieValueMatch = setCookie.match(/lumen_demo_session=([^;]+)/);
    expect(cookieValueMatch).not.toBeNull();
    const cookieValue = cookieValueMatch![1];
    expect(cookieValue).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    // Round-trip: verify the JWT and assert sub is lowercased.
    const { verifyLumenSession } = await import("@/lib/portal-session");
    const payload = await verifyLumenSession(cookieValue);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("drew@example.com");
  });

  it("sets the Secure flag when NODE_ENV is production", async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";

    try {
      const key = await makeKey("active-secure");
      installJwksFetch([key.jwk]);
      const token = await mintToken(key, { sub: "secure@example.com" });
      const { POST } = await loadRouteFresh();

      const res = await POST(buildRequest(token));
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie.toLowerCase()).toContain("secure");
    } finally {
      (process.env as Record<string, string>).NODE_ENV = savedNodeEnv;
    }
  });

  it("returns 500 when SESSION_SECRET is missing", async () => {
    delete process.env.SESSION_SECRET;
    const key = await makeKey("active-no-secret");
    installJwksFetch([key.jwk]);
    const token = await mintToken(key, { sub: "user@example.com" });
    const { POST } = await loadRouteFresh();

    const res = await POST(buildRequest(token));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("misconfigured");
    expect(body.detail).toMatch(/SESSION_SECRET/);
  });

  it("returns 401 with reason for a token signed by an unknown key", async () => {
    const portalKey = await makeKey("active-real");
    const attackerKey = await makeKey("attacker");
    installJwksFetch([portalKey.jwk]);
    const token = await mintToken(attackerKey);
    const { POST } = await loadRouteFresh();

    const res = await POST(buildRequest(token));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
    expect(["bad_signature", "no_matching_key", "malformed"]).toContain(
      body.detail,
    );
    expect(res.headers.get("set-cookie") ?? "").not.toContain(
      "lumen_demo_session",
    );
  });

  it("returns 401 for a token with the wrong audience", async () => {
    const key = await makeKey("active-wrong-aud");
    installJwksFetch([key.jwk]);
    const token = await mintToken(key, { aud: "axlepoint" });
    const { POST } = await loadRouteFresh();

    const res = await POST(buildRequest(token));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.detail).toBe("bad_audience");
  });

  it("returns 401 when no token is provided", async () => {
    const key = await makeKey("active-empty");
    installJwksFetch([key.jwk]);
    const { POST } = await loadRouteFresh();

    const res = await POST(buildRequest(""));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.detail).toBe("missing_token");
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const key = await makeKey("active-bad-json");
    installJwksFetch([key.jwk]);
    const { NextRequest } =
      require("next/server") as typeof import("next/server");
    const req = new NextRequest("http://0.0.0.0:3000/api/portal/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const { POST } = await loadRouteFresh();

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
  });

  it("returns 500 when portal env vars are missing", async () => {
    delete process.env.PORTAL_JWKS_URL;
    const { POST } = await loadRouteFresh();
    const res = await POST(buildRequest("anything"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("misconfigured");
    expect(body.detail).toMatch(/PORTAL_JWKS_URL/);
  });

  it("does not overwrite the existing cookie sign-in shortcut (route paths are separate)", async () => {
    const sessionMod = await import("@/app/api/session/route");
    expect(typeof sessionMod.POST).toBe("function");
    const portalMod = await import("@/app/api/portal/handoff/route");
    expect(typeof portalMod.POST).toBe("function");
  });
});
