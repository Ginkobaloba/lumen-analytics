import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import {
  verifyPortalToken,
  _resetJwksCacheForTests,
  type PortalVerifyConfig,
} from "@/lib/portal-jwks";

/**
 * CA5 rollback-flag coverage. The main suite (portal-jwks.test.ts) exercises
 * the default shared engine; this file pins the PORTAL_VERIFIER=bespoke
 * escape hatch so the rollback path cannot rot silently while it exists.
 */

const ISSUER = "https://portal.test.local";
const AUDIENCE = "lumenanalytics";

interface KeyMaterial {
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
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
  overrides: { aud?: string } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ customer_id: "cust-1", role: "customer" })
    .setProtectedHeader({ alg: "RS256", kid: key.jwk.kid as string, typ: "JWT" })
    .setIssuedAt(now)
    .setIssuer(ISSUER)
    .setAudience(overrides.aud ?? AUDIENCE)
    .setSubject("flag.test@example.com")
    .setExpirationTime(now + 60)
    .sign(key.privateKey);
}

function configWith(jwks: JWK[]): PortalVerifyConfig {
  return {
    jwksUrl: "https://portal.test.local/.well-known/jwks.json",
    expectedIssuer: ISSUER,
    expectedAudience: AUDIENCE,
    fetchJwks: async () => ({ keys: jwks }),
  };
}

beforeEach(() => {
  _resetJwksCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PORTAL_VERIFIER=bespoke rollback flag", () => {
  it("verifies a well-formed token through the bespoke engine", async () => {
    vi.stubEnv("PORTAL_VERIFIER", "bespoke");
    const key = await makeKey("flag-active");
    const token = await mintToken(key);

    const result = await verifyPortalToken(token, configWith([key.jwk]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.sub).toBe("flag.test@example.com");
    expect(result.kid).toBe("flag-active");
  });

  it("rejects a wrong-audience token through the bespoke engine", async () => {
    vi.stubEnv("PORTAL_VERIFIER", "bespoke");
    const key = await makeKey("flag-aud");
    const token = await mintToken(key, { aud: "axlepoint" });

    const result = await verifyPortalToken(token, configWith([key.jwk]));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("bad_audience");
  });

  it("any other flag value routes to the shared engine", async () => {
    vi.stubEnv("PORTAL_VERIFIER", "definitely-not-bespoke");
    const key = await makeKey("flag-shared");
    const token = await mintToken(key);

    const result = await verifyPortalToken(token, configWith([key.jwk]));

    expect(result.ok).toBe(true);
  });
});
