import { NextResponse, type NextRequest } from "next/server";
import {
  portalVerifyConfigFromEnv,
  verifyPortalToken,
  type PortalVerifyConfig,
  type VerifyResult,
} from "@/lib/portal-jwks";

/**
 * Portal handoff (chunk 4b).
 *
 * The Paradigm Portal mints an RS256 JWT and redirects the browser to
 * `<lumen_base_url>/#portal_token=<JWT>`. The fragment is read client-side
 * (see /src/components/portal-token-claim.tsx) and POSTed here as JSON:
 *
 *   POST /api/portal/handoff
 *   Content-Type: application/json
 *   { "token": "<JWT>" }
 *
 * On success we mint the existing demo session cookie (so the rest of the
 * app keeps working unchanged) and return 200 with the verified subject and
 * a path to redirect to. The client then navigates to /app.
 *
 * The cookie-only "/api/session" sign-in shortcut stays in place for now;
 * both paths converge on the same `lumen_demo_session` cookie.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_COOKIE = "lumen_demo_session";
const SESSION_TTL_SECONDS = 60 * 60; // 1h, matches portal JWT lifetime

interface HandoffBody {
  token?: unknown;
}

export async function POST(request: NextRequest) {
  let body: HandoffBody;
  try {
    body = (await request.json()) as HandoffBody;
  } catch {
    return jsonError(400, "bad_request", "request body is not valid JSON");
  }
  const token = typeof body.token === "string" ? body.token : "";

  let config: PortalVerifyConfig;
  try {
    config = portalVerifyConfigFromEnv();
  } catch (err) {
    // Misconfiguration is a 500: the operator forgot to wire the env vars.
    const detail = err instanceof Error ? err.message : "config error";
    return jsonError(500, "misconfigured", detail);
  }

  const result: VerifyResult = await verifyPortalToken(token, config);
  if (!result.ok) {
    return jsonError(401, "unauthorized", result.reason);
  }

  const response = NextResponse.json(
    {
      ok: true,
      redirect: "/app",
      subject: result.payload.sub,
      customer_id: result.payload.customer_id ?? null,
      role: result.payload.role ?? null,
    },
    { status: 200 },
  );
  // The demo runs read-only, so the cookie just records that the user has
  // claimed a valid portal token. We deliberately do not store the raw JWT.
  const cookieValue = encodeCookieValue({
    via: "portal",
    sub: result.payload.sub,
    kid: result.kid,
  });
  response.cookies.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

function jsonError(status: number, error: string, detail: string) {
  return NextResponse.json({ ok: false, error, detail }, { status });
}

function encodeCookieValue(claims: {
  via: string;
  sub: string;
  kid: string;
}): string {
  // Plain Base64URL JSON; the cookie is httpOnly and we trust it only for
  // "user has signed in" state. No app authorization decisions key off it.
  const json = JSON.stringify(claims);
  return Buffer.from(json, "utf8").toString("base64url");
}
