import { NextResponse, type NextRequest } from "next/server";
import { LUMEN_SESSION_COOKIE, verifyLumenSession } from "@/lib/portal-session";

/**
 * The /app surface requires a VALID signed session, not just a cookie named
 * lumen_demo_session. The cookie is an HS256 JWT minted by /api/session
 * (demo sign-in) or /api/portal/handoff (Portal launch); it is verified here
 * with jose in the Edge runtime. Anything else (no cookie, forged, tampered,
 * expired, alg-none, the old unsigned "demo-user" literal, or an unusable
 * SESSION_SECRET) redirects to the landing page and clears the bad cookie.
 */
export async function middleware(request: NextRequest) {
  const session = await verifyLumenSession(
    request.cookies.get(LUMEN_SESSION_COOKIE)?.value,
  );
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "?signin=required";
    const response = NextResponse.redirect(url);
    if (request.cookies.has(LUMEN_SESSION_COOKIE)) {
      response.cookies.delete(LUMEN_SESSION_COOKIE);
    }
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/app/:path*",
};
