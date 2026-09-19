import { SignJWT } from "jose";

/**
 * Test-only session token fixtures. TEST_SECRET is a throwaway value that
 * exists only in this file; no real secret is ever read by the tests.
 */

export const TEST_SECRET = "test-only-session-secret-0123456789abcdefghij";
export const OTHER_SECRET = "attacker-controlled-secret-9876543210zyxwvutsr";
export const COOKIE = "lumen_demo_session";

const enc = (s: string) => new TextEncoder().encode(s);
const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");

interface ClaimOverrides {
  iss?: string;
  aud?: string;
  sub?: string;
  jti?: string | null;
  iat?: number;
  exp?: number;
  src?: string;
}

/** Sign a session-shaped JWT with full control over claims, alg and key. */
export async function signSession(
  overrides: ClaimOverrides = {},
  opts: { secret?: string; alg?: "HS256" | "HS512" } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  let builder = new SignJWT({
    customer_id: null,
    role: "demo",
    src: overrides.src ?? "demo",
  })
    .setProtectedHeader({ alg: opts.alg ?? "HS256", typ: "JWT" })
    .setIssuer(overrides.iss ?? "lumen-analytics")
    .setAudience(overrides.aud ?? "lumen-session")
    .setSubject(overrides.sub ?? "demo@lumenanalytics.example")
    .setIssuedAt(overrides.iat ?? now)
    .setExpirationTime(overrides.exp ?? now + 3600);
  if (overrides.jti !== null) {
    builder = builder.setJti(overrides.jti ?? "test-jti-1");
  }
  return builder.sign(enc(opts.secret ?? TEST_SECRET));
}

/** Named hostile cookie values every session gate must reject. */
export async function hostileCookies(): Promise<Record<string, string>> {
  const now = Math.floor(Date.now() / 1000);
  const valid = await signSession();
  const [h, , sig] = valid.split(".");
  const tamperedPayload = b64url({
    iss: "lumen-analytics",
    aud: "lumen-session",
    sub: "admin@lumenanalytics.example",
    jti: "test-jti-1",
    iat: now,
    exp: now + 3600,
    src: "portal",
    role: "internal",
    customer_id: null,
  });
  const nonePayload = b64url({
    iss: "lumen-analytics",
    aud: "lumen-session",
    sub: "demo@lumenanalytics.example",
    jti: "none-jti",
    iat: now,
    exp: now + 3600,
    src: "demo",
  });
  return {
    "unsigned demo-user literal": "demo-user",
    "empty value": "",
    "forged with another secret": await signSession({}, { secret: OTHER_SECRET }),
    "tampered payload, original signature": `${h}.${tamperedPayload}.${sig}`,
    expired: await signSession({ iat: now - 7200, exp: now - 3600 }),
    "alg none, no signature": `${b64url({ alg: "none", typ: "JWT" })}.${nonePayload}.`,
    "HS512 with the right secret": await signSession({}, { alg: "HS512" }),
    "missing jti": await signSession({ jti: null }),
    "wrong audience": await signSession({ aud: "some-other-app" }),
    "unknown src": await signSession({ src: "admin" }),
    "older than the max age": await signSession({ iat: now - 7200, exp: now + 3600 }),
  };
}
