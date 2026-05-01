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
  let res: Response;
  try {
    res = await fetch(`http://${BACKEND}/api/auth/google/authorize`, {
      redirect: "manual",
    });
  } catch {
    return NextResponse.redirect(new URL("/login?error=server", publicOrigin(request)));
  }

  const location = res.headers.get("location");
  if (res.status < 300 || res.status >= 400 || !location) {
    return NextResponse.redirect(new URL("/login?error=server", publicOrigin(request)));
  }

  return NextResponse.redirect(location);
}
