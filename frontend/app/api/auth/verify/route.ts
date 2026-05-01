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
  const token = request.nextUrl.searchParams.get("token");
  const origin = publicOrigin(request);

  if (!token) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const preflight = request.cookies.get("preflight")?.value;

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `http://${BACKEND}/api/auth/verify?token=${encodeURIComponent(token)}`,
      {
        redirect: "manual",
        headers: { cookie: preflight ? `preflight=${preflight}` : "" },
      }
    );
  } catch {
    return NextResponse.redirect(new URL("/login?error=server", origin));
  }

  if (backendRes.status !== 302) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", origin));
  }

  // Extract the path from the backend's redirect (base URL may be wrong in prod,
  // but the path — "/" or "/onboarding" — is always correct)
  let destPath = "/";
  const location = backendRes.headers.get("location");
  if (location) {
    try {
      destPath = new URL(location).pathname;
    } catch {
      destPath = location.startsWith("/") ? location : "/";
    }
  }

  const response = NextResponse.redirect(new URL(destPath, origin));

  // Forward Set-Cookie headers (sid + preflight deletion) from backend to browser
  const cookies = backendRes.headers.getSetCookie();
  for (const c of cookies) {
    response.headers.append("Set-Cookie", c);
  }

  return response;
}
