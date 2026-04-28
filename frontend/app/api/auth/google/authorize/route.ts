import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "localhost:8000";

export async function GET(request: NextRequest) {
  let res: Response;
  try {
    res = await fetch(`http://${BACKEND}/api/auth/google/authorize`, {
      redirect: "manual",
    });
  } catch {
    return NextResponse.redirect(new URL("/login?error=server", request.url));
  }

  const location = res.headers.get("location");
  if (res.status < 300 || res.status >= 400 || !location) {
    return NextResponse.redirect(new URL("/login?error=server", request.url));
  }

  return NextResponse.redirect(location);
}
