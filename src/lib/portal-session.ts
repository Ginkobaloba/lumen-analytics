import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * App-side session (session-cookie standardization).
 *
 * Once verifyPortalToken accepts a Portal handoff, we mint our own
 * short-lived session JWT and stash it in an HttpOnly cookie. The Portal
 * token itself is single-use handoff material per the contract; we do not
 * persist it.
 *
 * HS256 is fine here because only Lumen signs and reads its own session.
 * Asymmetric keys would be wasted complexity for a single-tenant cookie.
 * The kid field is omitted -- it is redundant for single-secret HS256.
 */

export const LUMEN_SESSION_COOKIE = "lumen_demo_session";
const SESSION_TTL_SECONDS = 60 * 60; // 1h matches portal JWT lifetime (per session-cookie standardization, kept lumen-specific TTL on purpose)

export interface LumenSessionPayload extends JWTPayload {
  sub: string;
  customer_id: string | null;
  role: string;
  src: "portal";
}

function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a value of at least 32 characters",
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Mint a session JWT for the verified Portal subject. Returns the raw
 * compact token; the caller decides where to put it (cookie, response
 * body during tests, etc).
 */
export async function mintLumenSession(args: {
  email: string;
  customerId: string | null;
  role: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;
  const token = await new SignJWT({
    customer_id: args.customerId,
    role: args.role,
    src: "portal",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(args.email.toLowerCase())
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecret());

  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Verify a session token. Returns null on any failure.
 */
export async function verifyLumenSession(
  token: string,
): Promise<LumenSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return payload as LumenSessionPayload;
  } catch {
    return null;
  }
}

/**
 * Helpers for the cookie surface. Kept tiny so the API route does not
 * have to know the cookie name.
 */
export function lumenSessionCookieName(): string {
  return LUMEN_SESSION_COOKIE;
}

export function lumenSessionCookieAttributes(expiresAt: Date) {
  return {
    name: LUMEN_SESSION_COOKIE,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
