import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE = "lumen_demo_session";

/** The /app surface requires the demo session cookie set by /api/session.
    Same pattern as AxlePoint: no credentials anywhere, the cookie just
    makes the demo read like a signed-in product. */
export function middleware(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "?signin=required";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/app/:path*",
};
