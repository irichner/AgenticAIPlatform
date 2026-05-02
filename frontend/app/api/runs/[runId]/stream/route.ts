import { NextRequest } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "localhost:8000";

/**
 * Streaming proxy for SSE agent run events.
 *
 * Next.js rewrites buffer SSE responses before forwarding them, so all events
 * arrive in one batch when the run finishes. This Route Handler pipes the
 * backend body directly, giving the browser real-time event delivery.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const orgId  = request.headers.get("x-org-id") ?? "";
  const cookie = request.headers.get("cookie") ?? "";

  let backendRes: Response;
  try {
    backendRes = await fetch(`http://${BACKEND}/api/runs/${runId}/stream`, {
      headers: {
        accept: "text/event-stream",
        "cache-control": "no-cache",
        ...(orgId  && { "x-org-id": orgId }),
        ...(cookie && { cookie }),
      },
    });
  } catch {
    return new Response("Backend unavailable", { status: 503 });
  }

  if (!backendRes.ok || !backendRes.body) {
    return new Response(await backendRes.text(), { status: backendRes.status });
  }

  return new Response(backendRes.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
