import { NextResponse, type NextRequest } from "next/server";
import {
  LUMEN_SESSION_COOKIE,
  SessionMisconfiguredError,
  lumenSessionCookieAttributes,
  mintDemoSession,
} from "@/lib/portal-session";

/**
 * Redirect with a path-relative Location header.
 *
 * We deliberately avoid NextResponse.redirect(new URL(path, request.url)):
 * behind the demo's reverse proxy the origin of request.url is the
 * container's internal bind address (0.0.0.0:3000), so an absolute redirect
 * ships `Location: https://0.0.0.0:3000/app` and the browser follows it to a
 * dead host. A relative Location is resolved by the browser against the
 * address-bar origin (the real public host), which is what we want.
 */
function relativeRedirect(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/**
 * Demo authentication. POST signs in as the demo user and lands on the
 * executive overview; POST with ?signout=1 clears the session and returns
 * to the marketing page. There are no credentials anywhere in this demo,
 * but the session itself is real: the cookie is a signed HS256 JWT (jti,
 * iat, exp) that src/middleware.ts and the session-required API routes
 * verify. With SESSION_SECRET missing or short, sign-in fails closed with
 * 500 "misconfigured", same as the Portal handoff.
 */
export async function POST(request: NextRequest) {
  const signout = request.nextUrl.searchParams.get("signout");
  if (signout) {
    const response = relativeRedirect("/");
    response.cookies.delete(LUMEN_SESSION_COOKIE);
    return response;
  }

  let token: string;
  let expiresAt: Date;
  try {
    ({ token, expiresAt } = await mintDemoSession());
  } catch (err) {
    if (err instanceof SessionMisconfiguredError) {
      console.error("[session] misconfigured:", err.message);
      return NextResponse.json({ error: "misconfigured" }, { status: 500 });
    }
    throw err;
  }

  const response = relativeRedirect("/app");
  response.cookies.set({
    ...lumenSessionCookieAttributes(expiresAt),
    value: token,
  });
  return response;
}
