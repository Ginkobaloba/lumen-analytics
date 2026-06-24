import { NextResponse, type NextRequest } from "next/server";
import {
  portalVerifyConfigFromEnv,
  verifyPortalToken,
  type PortalVerifyConfig,
  type VerifyResult,
} from "@/lib/portal-jwks";
import {
  mintLumenSession,
  lumenSessionCookieAttributes,
} from "@/lib/portal-session";

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
 * On success we mint a signed session JWT and stash it in an HttpOnly cookie,
 * then return 200 with the verified subject and a path to redirect to. The
 * client then navigates to /app.
 *
 * The cookie-only "/api/session" sign-in shortcut stays in place for now;
 * both paths converge on the same `lumen_demo_session` cookie.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const customerId = result.payload.customer_id ?? null;
  const role = result.payload.role ?? "customer";

  let sessionToken: string;
  let expiresAt: Date;
  try {
    ({ token: sessionToken, expiresAt } = await mintLumenSession({
      email: result.payload.sub,
      customerId,
      role,
    }));
  } catch (err) {
    const detail = err instanceof Error ? err.message : "session error";
    return jsonError(500, "misconfigured", detail);
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

  response.cookies.set({
    ...lumenSessionCookieAttributes(expiresAt),
    value: sessionToken,
  });

  return response;
}

function jsonError(status: number, error: string, detail: string) {
  return NextResponse.json({ ok: false, error, detail }, { status });
}
