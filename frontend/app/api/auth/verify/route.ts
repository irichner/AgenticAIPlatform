import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "localhost:8000";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
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
    return NextResponse.redirect(new URL("/login?error=server", request.url));
  }

  if (backendRes.status !== 302) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));

  // Forward Set-Cookie headers (sid + preflight deletion) from backend to browser
  const cookies = backendRes.headers.getSetCookie();
  for (const c of cookies) {
    response.headers.append("Set-Cookie", c);
  }

  return response;
}
