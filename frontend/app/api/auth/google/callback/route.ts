import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "localhost:8000";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/login?error=google_denied", request.url));
  }

  let res: Response;
  try {
    res = await fetch(
      `http://${BACKEND}/api/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
    );
  } catch {
    return NextResponse.redirect(new URL("/login?error=server", request.url));
  }

  if (res.status < 300 || res.status >= 400) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  for (const cookie of res.headers.getSetCookie()) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}
