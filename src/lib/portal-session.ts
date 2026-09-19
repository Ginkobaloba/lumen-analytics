// Subpath imports keep the Edge middleware bundle to JWS/JWT only. The jose
// root entry also pulls in JWE (deflate via CompressionStream), which Next's
// Edge analyzer flags as unsupported even though it is never called here.
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import type { JWTPayload } from "jose";

/**
 * Lumen session tokens: the one signed cookie every signed-in path converges
 * on (demo sign-in at /api/session, Portal handoff at /api/portal/handoff).
 *
 * The cookie value is an HS256 JWT signed with SESSION_SECRET and carrying
 * jti, iat and exp. src/middleware.ts verifies it in the Edge runtime on
 * every /app request, and every API route that requires a session verifies
 * it the same way (readRequestSession below). Presence of the cookie is
 * never enough: a forged, tampered, expired, alg-none or unsigned value is
 * rejected exactly as if no cookie were sent.
 *
 * HS256 is fine here because only Lumen signs and reads its own session.
 * Asymmetric keys would be wasted complexity for a single-tenant cookie.
 * The kid field is omitted: it is redundant for single-secret HS256.
 *
 * Fail closed: when SESSION_SECRET is missing or shorter than 32 characters
 * nothing can be minted (callers answer 500 "misconfigured", same as the
 * Portal handoff always has) and nothing verifies (middleware redirects,
 * session-required routes answer 500 "misconfigured").
 *
 * This module must stay Edge-safe: no node: imports, no "server-only".
 */

export const LUMEN_SESSION_COOKIE = "lumen_demo_session";

/** 1h. Matches the Portal JWT lifetime; the demo path uses the same TTL. */
export const SESSION_TTL_SECONDS = 60 * 60;

/** Minimum SESSION_SECRET length, shared by mint and verify. */
export const MIN_SECRET_LENGTH = 32;

// Domain separation: a token signed with the same secret for some other
// purpose (another app reusing the value, say) still fails these checks.
const SESSION_ISSUER = "lumen-analytics";
const SESSION_AUDIENCE = "lumen-session";

export type LumenSessionSource = "portal" | "demo";

export interface LumenSessionPayload extends JWTPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  customer_id: string | null;
  role: string;
  src: LumenSessionSource;
}

/** Thrown by the mint helpers when SESSION_SECRET is unusable. */
export class SessionMisconfiguredError extends Error {
  constructor() {
    super(
      `SESSION_SECRET must be set to a value of at least ${MIN_SECRET_LENGTH} characters`,
    );
    this.name = "SessionMisconfiguredError";
  }
}

/**
 * The signing key, or null when SESSION_SECRET is missing or short. Read on
 * every call so a rotated secret takes effect without a restart.
 */
export function readSessionSecret(): Uint8Array | null {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < MIN_SECRET_LENGTH) return null;
  return new TextEncoder().encode(raw);
}

async function mintSession(claims: {
  sub: string;
  customerId: string | null;
  role: string;
  src: LumenSessionSource;
}): Promise<{ token: string; expiresAt: Date }> {
  const secret = readSessionSecret();
  if (!secret) throw new SessionMisconfiguredError();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;
  const token = await new SignJWT({
    customer_id: claims.customerId,
    role: claims.role,
    src: claims.src,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(claims.sub)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secret);
  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Mint a session JWT for the verified Portal subject. Returns the raw
 * compact token; the caller decides where to put it. Throws
 * SessionMisconfiguredError when SESSION_SECRET is unusable.
 */
export async function mintLumenSession(args: {
  email: string;
  customerId: string | null;
  role: string;
}): Promise<{ token: string; expiresAt: Date }> {
  return mintSession({
    sub: args.email.toLowerCase(),
    customerId: args.customerId,
    role: args.role,
    src: "portal",
  });
}

/** The fictional demo user the one-click sign-in grants. */
export const DEMO_SUBJECT = "demo@lumenanalytics.example";

/**
 * Mint a session JWT for the one-click demo sign-in. Throws
 * SessionMisconfiguredError when SESSION_SECRET is unusable.
 */
export async function mintDemoSession(): Promise<{
  token: string;
  expiresAt: Date;
}> {
  return mintSession({
    sub: DEMO_SUBJECT,
    customerId: null,
    role: "demo",
    src: "demo",
  });
}

/**
 * Verify a session token. Returns null on any failure, including an
 * unusable SESSION_SECRET (fail closed). Callers that need to tell
 * "misconfigured" from "bad token" check readSessionSecret() first, or use
 * readRequestSession.
 */
export async function verifyLumenSession(
  token: string | null | undefined,
): Promise<LumenSessionPayload | null> {
  if (!token || typeof token !== "string") return null;
  const secret = readSessionSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      requiredClaims: ["sub", "jti", "iat", "exp"],
      maxTokenAge: SESSION_TTL_SECONDS,
    });
    if (
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      typeof payload.jti !== "string" ||
      payload.jti.length === 0 ||
      (payload.src !== "portal" && payload.src !== "demo")
    ) {
      return null;
    }
    return payload as LumenSessionPayload;
  } catch {
    return null;
  }
}

export type RequestSessionResult =
  | { ok: true; session: LumenSessionPayload }
  | { ok: false; reason: "misconfigured" | "unauthorized" };

/** Minimal request shape, satisfied by NextRequest in both runtimes. */
interface CookieCarrier {
  cookies: { get(name: string): { value: string } | undefined };
}

/**
 * Session gate for API routes: validity, not presence. Distinguishes an
 * unusable SESSION_SECRET (the operator's problem, 500) from a missing or
 * invalid cookie (the caller's problem, 401).
 */
export async function readRequestSession(
  request: CookieCarrier,
): Promise<RequestSessionResult> {
  if (!readSessionSecret()) return { ok: false, reason: "misconfigured" };
  const session = await verifyLumenSession(
    request.cookies.get(LUMEN_SESSION_COOKIE)?.value,
  );
  return session
    ? { ok: true, session }
    : { ok: false, reason: "unauthorized" };
}

/**
 * Helpers for the cookie surface. Kept tiny so the API routes do not have
 * to know the cookie name.
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
