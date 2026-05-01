import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "localhost:8000";

function publicOrigin(req: NextRequest): string {
  const proto = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const host = (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "localhost:3000"
  ).split(",")[0].trim();
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const origin = publicOrigin(request);

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/login?error=google_denied", origin));
  }

  let res: Response;
  try {
    res = await fetch(
      `http://${BACKEND}/api/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
    );
  } catch {
    return NextResponse.redirect(new URL("/login?error=server", origin));
  }

  if (res.status < 300 || res.status >= 400) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", origin));
  }

  // Extract the path from the backend's redirect (base URL may be wrong in prod,
  // but the path — "/" or "/onboarding" — is always correct)
  let destPath = "/";
  const location = res.headers.get("location");
  if (location) {
    try {
      destPath = new URL(location).pathname;
    } catch {
      destPath = location.startsWith("/") ? location : "/";
    }
  }

  const response = NextResponse.redirect(new URL(destPath, origin));
  for (const cookie of res.headers.getSetCookie()) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}
