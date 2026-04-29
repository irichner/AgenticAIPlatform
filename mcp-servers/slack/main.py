"""MCP Slack Integration Server  (port 8026).

MCP Tool endpoints:
  POST /tools/slack_post_message   — post a message to a Slack channel
  POST /tools/slack_list_channels  — list channels the bot belongs to
  GET  /tools                      — MCP tool catalog

Webhook:
  POST /webhook/slack              — Slack Events API receiver → forwards as signals
  POST /simulate                   — dev helper: inject mock slack message
"""
from __future__ import annotations
import hashlib
import hmac
import json
import os
import time

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

SLACK_BOT_TOKEN: str = os.getenv("SLACK_BOT_TOKEN", "")
SLACK_SIGNING_SECRET: str = os.getenv("SLACK_SIGNING_SECRET", "")
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://backend:8000")
DEFAULT_ORG_ID: str = os.getenv("DEFAULT_ORG_ID", "")

app = FastAPI(title="MCP Slack Server", version="0.1.0")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _verify_slack_signature(body: bytes, timestamp: str, signature: str) -> bool:
    if not SLACK_SIGNING_SECRET:
        return True  # dev/no-config mode
    base = f"v0:{timestamp}:{body.decode()}"
    expected = "v0=" + hmac.new(
        SLACK_SIGNING_SECRET.encode(), base.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _ingest_signal(org_id: str, source: str, event_type: str, payload: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"{BACKEND_URL}/api/signals/ingest",
                json={"source": source, "event_type": event_type, "payload": payload},
                headers={"X-Org-Id": org_id},
            )
    except Exception:
        pass  # best-effort


# ── Tool catalog ──────────────────────────────────────────────────────────────

@app.get("/tools")
async def list_tools():
    return {
        "tools": [
            {
                "name": "slack_post_message",
                "description": "Post a message to a Slack channel",
                "parameters": {
                    "channel": {"type": "string", "description": "Channel ID or #name"},
                    "text": {"type": "string", "description": "Message body (markdown)"},
                    "thread_ts": {"type": "string", "description": "Thread TS to reply in-thread", "required": False},
                },
            },
            {
                "name": "slack_list_channels",
                "description": "List Slack channels the bot belongs to",
                "parameters": {},
            },
        ]
    }


# ── Tool handlers ─────────────────────────────────────────────────────────────

@app.post("/tools/slack_post_message")
async def slack_post_message(request: Request):
    body = await request.json()
    channel: str = body.get("channel", "")
    text: str = body.get("text", "")
    thread_ts: str | None = body.get("thread_ts")

    if not SLACK_BOT_TOKEN:
        return {"ok": True, "mock": True, "channel": channel, "text": text}

    payload: dict = {"channel": channel, "text": text}
    if thread_ts:
        payload["thread_ts"] = thread_ts

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://slack.com/api/chat.postMessage",
            json=payload,
            headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}"},
        )
    return resp.json()


@app.post("/tools/slack_list_channels")
async def slack_list_channels():
    if not SLACK_BOT_TOKEN:
        return {
            "ok": True,
            "mock": True,
            "channels": [
                {"id": "C001", "name": "sales-general"},
                {"id": "C002", "name": "wins"},
                {"id": "C003", "name": "deal-room"},
            ],
        }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://slack.com/api/conversations.list",
            params={"types": "public_channel,private_channel", "limit": 200},
            headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}"},
        )
    return resp.json()


# ── Webhook receiver ──────────────────────────────────────────────────────────

@app.post("/webhook/slack")
async def slack_webhook(
    request: Request,
    x_slack_request_timestamp: str | None = Header(None),
    x_slack_signature: str | None = Header(None),
):
    body_bytes = await request.body()

    try:
        payload = json.loads(body_bytes)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")

    # Slack sends a challenge on initial URL verification
    if payload.get("type") == "url_verification":
        return JSONResponse({"challenge": payload["challenge"]})

    # Reject stale or tampered requests
    if x_slack_request_timestamp and x_slack_signature:
        if abs(time.time() - int(x_slack_request_timestamp)) > 300:
            raise HTTPException(403, "Stale request")
        if not _verify_slack_signature(body_bytes, x_slack_request_timestamp, x_slack_signature):
            raise HTTPException(403, "Invalid signature")

    event = payload.get("event", {})
    event_type = event.get("type", "")
    org_id = request.headers.get("X-Org-Id", DEFAULT_ORG_ID)

    if event_type in ("message", "reaction_added", "app_mention") and org_id:
        await _ingest_signal(
            org_id,
            "slack",
            f"slack.{event_type}",
            {
                "channel": event.get("channel"),
                "user": event.get("user"),
                "text": event.get("text", ""),
                "ts": event.get("ts"),
                "thread_ts": event.get("thread_ts"),
                "reaction": event.get("reaction"),
            },
        )

    return {"ok": True}


# ── Dev simulation ────────────────────────────────────────────────────────────

@app.post("/simulate")
async def simulate_slack_message(request: Request):
    """Inject a mock Slack message as a signal — useful for end-to-end testing."""
    body = await request.json()
    org_id: str = body.get("org_id", DEFAULT_ORG_ID)
    channel: str = body.get("channel", "C002")
    text: str = body.get("text", "Just closed Acme Corp — $120k ARR!")
    user: str = body.get("user", "U001")

    signal_payload = {
        "source": "slack",
        "event_type": "slack.message",
        "payload": {
            "channel": channel,
            "user": user,
            "text": text,
            "ts": str(time.time()),
        },
    }

    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            f"{BACKEND_URL}/api/signals/ingest",
            json=signal_payload,
            headers={"X-Org-Id": org_id},
        )

    return {
        "injected": True,
        "signal_status": resp.status_code,
        "signal_response": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text,
    }


@app.get("/health")
async def health():
    return {"status": "ok", "service": "mcp-slack"}
