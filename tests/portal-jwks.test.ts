import { describe, expect, it, beforeEach } from "vitest";
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import {
  verifyPortalToken,
  portalVerifyConfigFromEnv,
  _resetJwksCacheForTests,
  type PortalVerifyConfig,
} from "@/lib/portal-jwks";

/**
 * Unit tests for the portal JWKS verifier.
 *
 * The portal subdomain is not necessarily live in CI, so we spin up an
 * in-memory JWKS: generate an RSA keypair, sign a token with the private
 * key, expose the public key as a JWK via the `fetchJwks` config override.
 * verifyPortalToken should treat that JWKS exactly like a real one.
 */

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

interface KeyMaterial {
  privateKey: SigningKey;
  jwk: JWK;
}

const ISSUER = "https://portal.test.local";
const AUDIENCE = "lumenanalytics";

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
    customer_id?: string | null;
    role?: "customer" | "staff" | "internal";
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({
    customer_id: overrides.customer_id ?? null,
    role: overrides.role ?? "customer",
  })
    .setProtectedHeader({ alg: "RS256", kid: key.jwk.kid as string, typ: "JWT" })
    .setIssuedAt(overrides.iat ?? now)
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? AUDIENCE)
    .setSubject(overrides.sub ?? "demo.user@example.com")
    .setExpirationTime(overrides.exp ?? now + 60);
  return builder.sign(key.privateKey);
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

describe("verifyPortalToken", () => {
  it("returns payload + kid for a well-formed token signed by an active key", async () => {
    const key = await makeKey("active-1");
    const token = await mintToken(key, {
      sub: "drew@example.com",
      customer_id: "cust-7",
      role: "internal",
    });

    const result = await verifyPortalToken(token, configWith([key.jwk]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.sub).toBe("drew@example.com");
    expect(result.payload.aud).toBe(AUDIENCE);
    expect(result.payload.iss).toBe(ISSUER);
    expect(result.payload.customer_id).toBe("cust-7");
    expect(result.payload.role).toBe("internal");
    expect(result.kid).toBe("active-1");
  });

  it("verifies against the previous key during rotation (rotation grace)", async () => {
    const previous = await makeKey("prev-1");
    const active = await makeKey("active-2");
    const token = await mintToken(previous);

    const result = await verifyPortalToken(
      token,
      configWith([active.jwk, previous.jwk]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kid).toBe("prev-1");
  });

  it("rejects a token with the wrong audience", async () => {
    const key = await makeKey("active-aud");
    const token = await mintToken(key, { aud: "axlepoint" });

    const result = await verifyPortalToken(token, configWith([key.jwk]));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("bad_audience");
  });

  it("rejects a token with the wrong issuer", async () => {
    const key = await makeKey("active-iss");
    const token = await mintToken(key, { iss: "https://evil.example.com" });

    const result = await verifyPortalToken(token, configWith([key.jwk]));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("bad_issuer");
  });

  it("rejects an expired token", async () => {
    const key = await makeKey("active-exp");
    const now = Math.floor(Date.now() / 1000);
    const token = await mintToken(key, { iat: now - 7200, exp: now - 60 });

    const result = await verifyPortalToken(token, configWith([key.jwk]));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("expired");
  });

  it("rejects a token signed by an unknown key (no matching JWK)", async () => {
    const signer = await makeKey("attacker");
    const portal = await makeKey("portal-active");
    const token = await mintToken(signer);

    const result = await verifyPortalToken(token, configWith([portal.jwk]));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["bad_signature", "no_matching_key"]).toContain(result.reason);
  });

  it("rejects a token with an empty subject claim", async () => {
    const key = await makeKey("active-nosub");
    const token = await mintToken(key, { sub: "   " });

    const result = await verifyPortalToken(token, configWith([key.jwk]));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing_subject");
  });

  it("returns missing_token for empty input", async () => {
    const key = await makeKey("active-mt");
    const cfg = configWith([key.jwk]);

    for (const token of ["", null, undefined]) {
      const result = await verifyPortalToken(
        token as string | null | undefined,
        cfg,
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe("missing_token");
    }
  });

  it("returns jwks_fetch_failed when the JWKS loader throws", async () => {
    const key = await makeKey("active-fetchfail");
    const token = await mintToken(key);
    const cfg: PortalVerifyConfig = {
      jwksUrl: "https://unreachable.invalid/.well-known/jwks.json",
      expectedIssuer: ISSUER,
      expectedAudience: AUDIENCE,
      fetchJwks: async () => {
        throw new Error("network down");
      },
    };

    const result = await verifyPortalToken(token, cfg);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("jwks_fetch_failed");
  });

  it("returns no_matching_key when the JWKS is empty", async () => {
    const key = await makeKey("active-empty");
    const token = await mintToken(key);
    const cfg = configWith([]);

    const result = await verifyPortalToken(token, cfg);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_matching_key");
  });

  it("rejects garbage that is not even a JWT", async () => {
    const key = await makeKey("active-garbage");
    const result = await verifyPortalToken(
      "not.a.jwt.at.all",
      configWith([key.jwk]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["malformed", "bad_signature", "no_matching_key"]).toContain(
      result.reason,
    );
  });
});

describe("portalVerifyConfigFromEnv", () => {
  it("reads PORTAL_* env vars", () => {
    const cfg = portalVerifyConfigFromEnv({
      PORTAL_JWKS_URL: "https://portal.example.com/.well-known/jwks.json",
      PORTAL_EXPECTED_ISSUER: "https://portal.example.com",
      PORTAL_EXPECTED_AUD: "lumenanalytics",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.jwksUrl).toBe(
      "https://portal.example.com/.well-known/jwks.json",
    );
    expect(cfg.expectedIssuer).toBe("https://portal.example.com");
    expect(cfg.expectedAudience).toBe("lumenanalytics");
  });

  it("throws when any required env var is missing", () => {
    expect(() =>
      portalVerifyConfigFromEnv({
        PORTAL_JWKS_URL: "https://portal.example.com/.well-known/jwks.json",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/PORTAL_EXPECTED_ISSUER/);
  });
});
