import { importJWK, jwtVerify, type JWTPayload, type JWK } from "jose";

/**
 * Portal JWT verification (chunk 4b).
 *
 * The Paradigm Portal mints RS256 JWTs and publishes its public keys at a
 * standard JWKS endpoint:
 *
 *   GET <PORTAL_JWKS_URL>
 *
 * On each handoff we fetch (or reuse the cached) JWKS, then try every key
 * until one verifies the signature. That handles the rotation grace window
 * documented in PORTAL_GATE_CONTRACT.md (active + previous keys live in the
 * JWKS at the same time so tokens minted just before rotation still verify).
 *
 * Verification also enforces:
 *   - alg=RS256 (asymmetric, matches portal)
 *   - iss equals PORTAL_EXPECTED_ISSUER
 *   - aud equals PORTAL_EXPECTED_AUD (lumenanalytics)
 *   - exp not in the past, iat not in the future
 *   - sub is a non-empty string
 *
 * On any failure we return a tagged error code so callers can log or surface
 * a reason. We never throw out of this helper; callers should treat null
 * payload as a 401.
 */

const CACHE_TTL_MS = 60 * 60 * 1000;            // 1h fresh, per contract Cache-Control max-age
const CACHE_SWR_MS = CACHE_TTL_MS + 10 * 60 * 1000; // +10m stale-while-revalidate

export type VerifyFailureReason =
  | "missing_token"
  | "jwks_fetch_failed"
  | "no_matching_key"
  | "bad_signature"
  | "bad_issuer"
  | "bad_audience"
  | "expired"
  | "missing_subject"
  | "malformed";

export interface VerifySuccess {
  ok: true;
  payload: PortalTokenPayload;
  kid: string;
}

export interface VerifyFailure {
  ok: false;
  reason: VerifyFailureReason;
}

export type VerifyResult = VerifySuccess | VerifyFailure;

export interface PortalTokenPayload extends JWTPayload {
  sub: string;
  aud: string;
  iss: string;
  customer_id?: string | null;
  role?: "customer" | "staff" | "internal";
}

export interface PortalVerifyConfig {
  jwksUrl: string;
  expectedIssuer: string;
  expectedAudience: string;
  /** Override for tests: synchronous fetch returning the JWK set object. */
  fetchJwks?: () => Promise<JwksDocument>;
  /** Override for tests: pin "now" in unix seconds. */
  clockNow?: () => number;
}

interface JwksDocument {
  keys: JWK[];
}

interface CacheEntry {
  doc: JwksDocument;
  fetchedAt: number;
}

const moduleCache = new Map<string, CacheEntry>();

/**
 * Verify a portal-minted JWT. Returns a structured result; never throws.
 *
 * Caller is responsible for sourcing config from env vars (and passing in a
 * test override of fetchJwks for unit tests so we never hit the network).
 */
export async function verifyPortalToken(
  token: string | null | undefined,
  config: PortalVerifyConfig,
): Promise<VerifyResult> {
  if (!token || typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "missing_token" };
  }

  let jwks: JwksDocument;
  try {
    jwks = await loadJwks(config);
  } catch {
    return { ok: false, reason: "jwks_fetch_failed" };
  }
  if (!jwks.keys || jwks.keys.length === 0) {
    return { ok: false, reason: "no_matching_key" };
  }

  // Try every key. jose's jwtVerify wants one key; the JWKS may carry both
  // the active and the previous public key during rotation.
  let sawSignatureFailure = false;
  let sawAudienceFailure = false;
  let sawIssuerFailure = false;
  let sawExpired = false;
  let sawMalformed = false;

  for (const jwk of jwks.keys) {
    try {
      const publicKey = await importJWK(jwk, "RS256");
      const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        issuer: config.expectedIssuer,
        audience: config.expectedAudience,
        algorithms: ["RS256"],
        currentDate: config.clockNow
          ? new Date(config.clockNow() * 1000)
          : undefined,
      });
      const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
      if (sub.length === 0) {
        return { ok: false, reason: "missing_subject" };
      }
      return {
        ok: true,
        payload: payload as PortalTokenPayload,
        kid: String(protectedHeader.kid ?? jwk.kid ?? ""),
      };
    } catch (err) {
      // Bucket the failure so we can return a more useful reason if no key
      // ever matches. jose throws errors with `code` properties we can read.
      const code = readErrorCode(err);
      if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
        sawSignatureFailure = true;
      } else if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
        const claim = readClaim(err);
        if (claim === "aud") sawAudienceFailure = true;
        else if (claim === "iss") sawIssuerFailure = true;
        else sawMalformed = true;
      } else if (code === "ERR_JWT_EXPIRED") {
        sawExpired = true;
      } else if (code === "ERR_JWS_INVALID" || code === "ERR_JWT_INVALID") {
        sawMalformed = true;
      } else {
        // Unknown shape: try the next key but remember the misfit.
        sawMalformed = true;
      }
    }
  }

  if (sawExpired) return { ok: false, reason: "expired" };
  if (sawAudienceFailure) return { ok: false, reason: "bad_audience" };
  if (sawIssuerFailure) return { ok: false, reason: "bad_issuer" };
  if (sawSignatureFailure) return { ok: false, reason: "bad_signature" };
  if (sawMalformed) return { ok: false, reason: "malformed" };
  return { ok: false, reason: "no_matching_key" };
}

/**
 * Read PORTAL_* env vars into the shape verifyPortalToken expects. Throws if
 * any are missing so misconfiguration fails loudly at startup rather than
 * silently 401ing every handoff.
 */
export function portalVerifyConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PortalVerifyConfig {
  const jwksUrl = env.PORTAL_JWKS_URL;
  const expectedIssuer = env.PORTAL_EXPECTED_ISSUER;
  const expectedAudience = env.PORTAL_EXPECTED_AUD;
  const missing: string[] = [];
  if (!jwksUrl) missing.push("PORTAL_JWKS_URL");
  if (!expectedIssuer) missing.push("PORTAL_EXPECTED_ISSUER");
  if (!expectedAudience) missing.push("PORTAL_EXPECTED_AUD");
  if (missing.length > 0) {
    throw new Error(
      "Portal federation env vars missing: " + missing.join(", "),
    );
  }
  return {
    jwksUrl: jwksUrl as string,
    expectedIssuer: expectedIssuer as string,
    expectedAudience: expectedAudience as string,
  };
}

/**
 * Test helper: reset the in-process cache between cases. Not exported from
 * the package surface in production code paths.
 */
export function _resetJwksCacheForTests(): void {
  moduleCache.clear();
}

async function loadJwks(config: PortalVerifyConfig): Promise<JwksDocument> {
  if (config.fetchJwks) {
    // Tests bypass the cache and hand us the JWKS directly.
    return config.fetchJwks();
  }
  const now = Date.now();
  const cached = moduleCache.get(config.jwksUrl);
  if (cached) {
    const age = now - cached.fetchedAt;
    if (age < CACHE_TTL_MS) {
      return cached.doc;
    }
    if (age < CACHE_SWR_MS) {
      // Stale but tolerable. Fire-and-forget a background refresh and return
      // the cached doc immediately. A refresh failure leaves the stale entry
      // in place; we will try again on the next call.
      void refreshJwks(config, now).catch(() => undefined);
      return cached.doc;
    }
  }
  const doc = await fetchJwksDocument(config.jwksUrl);
  moduleCache.set(config.jwksUrl, { doc, fetchedAt: now });
  return doc;
}

async function refreshJwks(
  config: PortalVerifyConfig,
  now: number,
): Promise<void> {
  const doc = await fetchJwksDocument(config.jwksUrl);
  moduleCache.set(config.jwksUrl, { doc, fetchedAt: now });
}

async function fetchJwksDocument(url: string): Promise<JwksDocument> {
  const res = await fetch(url, {
    headers: { Accept: "application/jwk-set+json, application/json" },
  });
  if (!res.ok) {
    throw new Error(
      "JWKS endpoint returned " + res.status + " " + res.statusText,
    );
  }
  const body = (await res.json()) as JwksDocument;
  if (!body || !Array.isArray(body.keys)) {
    throw new Error("JWKS endpoint returned malformed body");
  }
  return body;
}

function readErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

function readClaim(err: unknown): string {
  if (err && typeof err === "object" && "claim" in err) {
    const claim = (err as { claim?: unknown }).claim;
    if (typeof claim === "string") return claim;
  }
  return "";
}
