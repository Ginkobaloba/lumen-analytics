import {
  AuthError,
  InMemoryJwksCache,
  verifyToken,
  type Jwk,
} from "@paradigm-codes/auth";
import type {
  PortalTokenPayload,
  PortalVerifyConfig,
  VerifyFailureReason,
  VerifyResult,
} from "./portal-jwks-bespoke";

/**
 * Shared-library portal verifier (CA5).
 *
 * Delegates signature/claim checking to @paradigm-codes/auth (the K4 client
 * library, same engine the whole platform standardizes on) and adapts its
 * thrown AuthError codes back onto this app's tagged VerifyResult union, so
 * callers and tests are agnostic to which engine ran.
 *
 * Documented behavioral deltas vs the bespoke engine (all safe against the
 * portal contract, which always mints kid + exp):
 *   - a token without a `kid` header is rejected (bespoke tried every key)
 *   - a token without `exp` is rejected (bespoke deferred to jose defaults)
 *   - on a token failing multiple checks, temporal errors win over
 *     issuer/audience errors (the library checks exp/nbf first)
 */

// Match the bespoke 1h freshness window; the library clamps TTL to its
// [10 min, 60 min] bounds, so this lands exactly on the 60-minute max.
// Rotation is covered separately by the library's refetch-once-on-unknown-kid.
const CACHE_TTL_MS = 60 * 60 * 1000;

const cachesByUrl = new Map<string, InMemoryJwksCache>();

/** Test helper: drop all shared-engine caches (mirrors the bespoke reset). */
export function _resetSharedJwksCacheForTests(): void {
  cachesByUrl.clear();
}

function cacheFor(config: PortalVerifyConfig): InMemoryJwksCache {
  const clock = config.clockNow
    ? () => (config.clockNow as () => number)() * 1000
    : undefined;
  if (config.fetchJwks) {
    // Tests inject the JWKS directly. A fresh per-call cache keeps them
    // hermetic, mirroring the bespoke path which bypassed its cache for
    // overrides.
    const fetchJwks = config.fetchJwks;
    return new InMemoryJwksCache({
      jwksUri: config.jwksUrl,
      ttlMs: CACHE_TTL_MS,
      fetchJwks: async () => (await fetchJwks()).keys as unknown as Jwk[],
      now: clock,
    });
  }
  let cache = cachesByUrl.get(config.jwksUrl);
  if (!cache) {
    cache = new InMemoryJwksCache({
      jwksUri: config.jwksUrl,
      ttlMs: CACHE_TTL_MS,
    });
    cachesByUrl.set(config.jwksUrl, cache);
  }
  return cache;
}

const CODE_TO_REASON: Record<string, VerifyFailureReason> = {
  malformed_token: "malformed",
  invalid_algorithm: "malformed",
  missing_kid: "no_matching_key",
  unknown_kid: "no_matching_key",
  invalid_signature: "bad_signature",
  token_expired: "expired",
  not_yet_valid: "malformed",
  missing_claim: "malformed",
  invalid_issuer: "bad_issuer",
  invalid_audience: "bad_audience",
  jwks_fetch_failed: "jwks_fetch_failed",
};

function readHeaderKid(token: string): string {
  try {
    const [header] = token.split(".");
    const parsed = JSON.parse(
      Buffer.from(header ?? "", "base64url").toString("utf8"),
    ) as { kid?: unknown };
    return typeof parsed.kid === "string" ? parsed.kid : "";
  } catch {
    return "";
  }
}

export async function verifySharedPortalToken(
  token: string,
  config: PortalVerifyConfig,
): Promise<VerifyResult> {
  try {
    const claims = await verifyToken(token, {
      issuer: config.expectedIssuer,
      audience: config.expectedAudience,
      cache: cacheFor(config),
      now: config.clockNow
        ? () => (config.clockNow as () => number)() * 1000
        : undefined,
    });
    const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
    if (sub.length === 0) {
      return { ok: false, reason: "missing_subject" };
    }
    return {
      ok: true,
      payload: claims as unknown as PortalTokenPayload,
      kid: readHeaderKid(token),
    };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, reason: CODE_TO_REASON[err.code] ?? "malformed" };
    }
    // The library's own failures are all AuthError, so anything else bubbled
    // up from the injected JWKS fetcher (or the network). Bucket it the way
    // the bespoke engine did.
    return { ok: false, reason: "jwks_fetch_failed" };
  }
}
