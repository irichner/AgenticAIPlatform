import { NextRequest, NextResponse } from "next/server";

// Routes that don't require authentication
const PUBLIC_PATHS = ["/login", "/onboarding"];

// Prefixes that are always allowed through (Next.js internals + backend proxy)
const PUBLIC_PREFIXES = ["/_next/", "/api/", "/favicon"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and Next.js internals through unconditionally
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // Check for session cookie — absence means definitely unauthenticated.
  // The backend validates the actual session on every API call; this is a
  // lightweight first-pass redirect so the browser never renders a protected
  // page without a cookie at all.
  const sid = request.cookies.get("sid");
  if (!sid) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files.
     * Excludes: /_next/static, /_next/image, /favicon.ico
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
