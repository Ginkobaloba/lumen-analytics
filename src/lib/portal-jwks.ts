/**
 * Portal JWT verification -- dispatch layer (CA5 cutover).
 *
 * The default engine is the shared @paradigm-codes/auth client library (K4),
 * the same verifier every Paradigm consumer standardizes on. The pre-CA5
 * bespoke engine is preserved verbatim in ./portal-jwks-bespoke.ts as a
 * rollback path for one release:
 *
 *   PORTAL_VERIFIER=bespoke    # flips back without a code change or deploy
 *
 * The public API (result unions, env parsing, test reset) is unchanged from
 * the bespoke module; callers and tests are agnostic to which engine ran.
 * Remove the flag and the bespoke module together once the shared engine has
 * survived a release in production.
 */

import {
  verifyPortalToken as verifyWithBespoke,
  _resetJwksCacheForTests as resetBespokeCache,
  type PortalVerifyConfig,
  type VerifyResult,
} from "./portal-jwks-bespoke";
import {
  verifySharedPortalToken,
  _resetSharedJwksCacheForTests,
} from "./portal-jwks-shared";

export { portalVerifyConfigFromEnv } from "./portal-jwks-bespoke";
export type {
  PortalTokenPayload,
  PortalVerifyConfig,
  VerifyFailure,
  VerifyFailureReason,
  VerifyResult,
  VerifySuccess,
} from "./portal-jwks-bespoke";

/**
 * Verify a portal-minted JWT. Returns a structured result; never throws.
 * Engine selection is per-call so the rollback flag needs no process restart.
 */
export async function verifyPortalToken(
  token: string | null | undefined,
  config: PortalVerifyConfig,
): Promise<VerifyResult> {
  if (!token || typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "missing_token" };
  }
  if (process.env.PORTAL_VERIFIER === "bespoke") {
    return verifyWithBespoke(token, config);
  }
  return verifySharedPortalToken(token, config);
}

/** Test helper: reset both engines' JWKS caches between cases. */
export function _resetJwksCacheForTests(): void {
  resetBespokeCache();
  _resetSharedJwksCacheForTests();
}
