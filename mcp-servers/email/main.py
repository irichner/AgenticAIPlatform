"""MCP Email Server — Gmail/Outlook integration.

Exposes MCP tools:
  - email_list_threads   : list recent email threads
  - email_get_thread     : get full thread with messages
  - email_send           : send an email
  - email_search         : search emails by query

Also exposes:
  - POST /webhook/gmail  : receive Gmail push notifications
  - POST /simulate       : inject a test email signal (dev only)
  - GET  /health         : health check
"""
from __future__ import annotations
import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")
MCP_PORT = int(os.getenv("MCP_EMAIL_PORT", "8025"))

app = FastAPI(title="Lanara MCP — Email", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── MCP Tool definitions ───────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "email_list_threads",
        "description": "List recent email threads for the authenticated user. Returns thread metadata including subject, participants, and last activity.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "max_results": {"type": "integer", "default": 20, "description": "Number of threads to return"},
                "label_ids": {"type": "array", "items": {"type": "string"}, "description": "Gmail label IDs to filter by"},
                "query": {"type": "string", "description": "Gmail search query string"},
            },
        },
    },
    {
        "name": "email_get_thread",
        "description": "Get the full content of an email thread including all messages, participants, and attachments metadata.",
        "inputSchema": {
            "type": "object",
            "required": ["thread_id"],
            "properties": {
                "thread_id": {"type": "string", "description": "Gmail thread ID"},
            },
        },
    },
    {
        "name": "email_send",
        "description": "Send an email from the authenticated user's account.",
        "inputSchema": {
            "type": "object",
            "required": ["to", "subject", "body"],
            "properties": {
                "to": {"type": "array", "items": {"type": "string"}, "description": "Recipient email addresses"},
                "cc": {"type": "array", "items": {"type": "string"}, "description": "CC email addresses"},
                "subject": {"type": "string"},
                "body": {"type": "string", "description": "Email body in plain text or HTML"},
                "thread_id": {"type": "string", "description": "Reply to this thread if provided"},
            },
        },
    },
    {
        "name": "email_search",
        "description": "Search emails using Gmail search syntax (from:, to:, subject:, after:, etc.).",
        "inputSchema": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string"},
                "max_results": {"type": "integer", "default": 10},
            },
        },
    },
    {
        "name": "email_extract_contacts",
        "description": "Extract contact information (names, emails, roles) from an email thread and return structured data for CRM import.",
        "inputSchema": {
            "type": "object",
            "required": ["thread_id"],
            "properties": {
                "thread_id": {"type": "string"},
            },
        },
    },
]

# ── MCP protocol endpoints ─────────────────────────────────────────────────────

@app.get("/")
async def mcp_manifest():
    return {
        "name": "lanara-email",
        "version": "1.0.0",
        "description": "Gmail/Outlook email integration for Lanara CRM",
        "tools": TOOLS,
    }


@app.get("/tools")
async def list_tools():
    return {"tools": TOOLS}


@app.post("/tools/{tool_name}")
async def call_tool(tool_name: str, request: Request):
    body = await request.json()
    args = body.get("arguments", body)

    if tool_name == "email_list_threads":
        return await _list_threads(args)
    elif tool_name == "email_get_thread":
        return await _get_thread(args)
    elif tool_name == "email_send":
        return await _send_email(args)
    elif tool_name == "email_search":
        return await _search_emails(args)
    elif tool_name == "email_extract_contacts":
        return await _extract_contacts(args)
    else:
        raise HTTPException(404, f"Unknown tool: {tool_name}")


# ── Tool implementations ───────────────────────────────────────────────────────

async def _get_gmail_client(access_token: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url="https://gmail.googleapis.com/gmail/v1",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30.0,
    )


async def _list_threads(args: dict) -> dict:
    access_token = args.get("_access_token")
    if not access_token:
        # Return mock data when no token (dev mode)
        return _mock_threads()

    params: dict[str, Any] = {"maxResults": args.get("max_results", 20)}
    if args.get("query"):
        params["q"] = args["query"]
    if args.get("label_ids"):
        params["labelIds"] = args["label_ids"]

    async with await _get_gmail_client(access_token) as client:
        resp = await client.get("/users/me/threads", params=params)
        resp.raise_for_status()
        data = resp.json()

    threads = []
    for t in data.get("threads", []):
        threads.append({"thread_id": t["id"], "snippet": t.get("snippet", ""), "history_id": t.get("historyId")})

    return {"threads": threads, "count": len(threads)}


async def _get_thread(args: dict) -> dict:
    access_token = args.get("_access_token")
    thread_id = args["thread_id"]

    if not access_token:
        return _mock_thread(thread_id)

    async with await _get_gmail_client(access_token) as client:
        resp = await client.get(f"/users/me/threads/{thread_id}", params={"format": "full"})
        resp.raise_for_status()
        raw = resp.json()

    messages = []
    for msg in raw.get("messages", []):
        headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
        body = _extract_body(msg.get("payload", {}))
        messages.append({
            "id": msg["id"],
            "from": headers.get("from", ""),
            "to": headers.get("to", ""),
            "cc": headers.get("cc", ""),
            "subject": headers.get("subject", ""),
            "date": headers.get("date", ""),
            "body": body[:2000],  # truncate
            "snippet": msg.get("snippet", ""),
        })

    participants = _extract_participants(messages)
    return {"thread_id": thread_id, "messages": messages, "participants": participants}


def _extract_body(payload: dict) -> str:
    if payload.get("body", {}).get("data"):
        return base64.urlsafe_b64decode(payload["body"]["data"] + "==").decode("utf-8", errors="replace")
    for part in payload.get("parts", []):
        if part.get("mimeType") in ("text/plain", "text/html"):
            data = part.get("body", {}).get("data", "")
            if data:
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    return ""


def _extract_participants(messages: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    email_re = re.compile(r"([^<@\s]+@[^>\s]+)")
    name_re = re.compile(r"^([^<]+)<")
    for msg in messages:
        for field in ("from", "to", "cc"):
            raw = msg.get(field, "")
            if not raw:
                continue
            for entry in raw.split(","):
                entry = entry.strip()
                email_match = email_re.search(entry)
                if not email_match:
                    continue
                email = email_match.group(1).strip("<>")
                name_match = name_re.match(entry)
                name = name_match.group(1).strip().strip('"') if name_match else email.split("@")[0]
                if email not in seen:
                    seen[email] = {"email": email, "name": name, "roles": []}
                seen[email]["roles"].append(field)
    return list(seen.values())


async def _send_email(args: dict) -> dict:
    access_token = args.get("_access_token")
    if not access_token:
        return {"sent": True, "mock": True, "message_id": f"mock_{secrets.token_hex(8)}"}

    to = ", ".join(args.get("to", []))
    cc = ", ".join(args.get("cc", [])) if args.get("cc") else ""
    subject = args.get("subject", "")
    body = args.get("body", "")
    thread_id = args.get("thread_id")

    raw_msg = f"To: {to}\r\nSubject: {subject}\r\n"
    if cc:
        raw_msg += f"Cc: {cc}\r\n"
    raw_msg += f"\r\n{body}"

    encoded = base64.urlsafe_b64encode(raw_msg.encode()).decode()
    payload: dict[str, Any] = {"raw": encoded}
    if thread_id:
        payload["threadId"] = thread_id

    async with await _get_gmail_client(access_token) as client:
        resp = await client.post("/users/me/messages/send", json=payload)
        resp.raise_for_status()
        data = resp.json()

    return {"sent": True, "message_id": data.get("id"), "thread_id": data.get("threadId")}


async def _search_emails(args: dict) -> dict:
    access_token = args.get("_access_token")
    query = args["query"]

    if not access_token:
        return {"results": [], "query": query, "mock": True}

    params = {"q": query, "maxResults": args.get("max_results", 10)}
    async with await _get_gmail_client(access_token) as client:
        resp = await client.get("/users/me/messages", params=params)
        resp.raise_for_status()
        data = resp.json()

    return {"results": data.get("messages", []), "query": query, "count": len(data.get("messages", []))}


async def _extract_contacts(args: dict) -> dict:
    thread_data = await _get_thread(args)
    participants = thread_data.get("participants", [])
    # Enrich with title guesses from email signature patterns
    enriched = []
    for p in participants:
        enriched.append({
            "email": p["email"],
            "name": p["name"],
            "suggested_title": None,
            "roles_in_thread": list(set(p["roles"])),
        })
    return {"contacts": enriched, "thread_id": args["thread_id"]}


# ── Mock data (dev mode) ──────────────────────────────────────────────────────

def _mock_threads() -> dict:
    return {
        "threads": [
            {"thread_id": "mock_thread_001", "snippet": "Following up on our pricing discussion...", "history_id": "12345"},
            {"thread_id": "mock_thread_002", "snippet": "Re: Security questionnaire — responses attached", "history_id": "12346"},
            {"thread_id": "mock_thread_003", "snippet": "Intro: Sarah Chen <> John Smith re: Q3 expansion", "history_id": "12347"},
        ],
        "count": 3,
        "mock": True,
    }


def _mock_thread(thread_id: str) -> dict:
    return {
        "thread_id": thread_id,
        "messages": [
            {
                "id": f"{thread_id}_msg1",
                "from": "Sarah Chen <sarah@acme.com>",
                "to": "John Smith <john@lanara.app>",
                "subject": "Following up on pricing",
                "date": "Mon, 28 Apr 2026 14:00:00 +0000",
                "body": "Hi John, just circling back on our pricing discussion from last week. We're very interested in the Enterprise tier but need to understand the per-seat cost and whether we can get a volume discount for 500+ seats. Also, can you clarify the implementation timeline? We'd need to be live by Q3.",
                "snippet": "Following up on pricing discussion",
            }
        ],
        "participants": [
            {"email": "sarah@acme.com", "name": "Sarah Chen", "roles": ["from"]},
            {"email": "john@lanara.app", "name": "John Smith", "roles": ["to"]},
        ],
        "mock": True,
    }


# ── Webhook: Gmail push notifications ─────────────────────────────────────────

class GmailWebhookPayload(BaseModel):
    message: dict
    subscription: str


@app.post("/webhook/gmail")
async def gmail_webhook(
    request: Request,
    x_goog_resource_id: str = Header(None),
    x_goog_message_number: str = Header(None),
):
    """Receive Gmail push notification and forward as signal_event to backend."""
    body = await request.body()
    data = json.loads(body) if body else {}

    # Extract org context from subscription name pattern: /orgs/{org_id}/gmail
    subscription = data.get("subscription", "")
    org_id = _parse_org_from_subscription(subscription)
    if not org_id:
        return {"ok": False, "error": "cannot parse org from subscription"}

    # Decode the Gmail notification
    msg_data = data.get("message", {})
    if msg_data.get("data"):
        decoded = json.loads(base64.urlsafe_b64decode(msg_data["data"] + "==").decode())
    else:
        decoded = {}

    # Forward to backend as a signal event
    signal_payload = {
        "source": "gmail",
        "event_type": "email_notification",
        "payload": {
            "history_id": decoded.get("historyId"),
            "email_address": decoded.get("emailAddress"),
            "message_id": msg_data.get("messageId"),
            "publish_time": msg_data.get("publishTime"),
        },
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{BACKEND_URL}/api/signals/ingest",
                json=signal_payload,
                headers={"X-Org-Id": org_id, "X-Mcp-Source": "email"},
            )
    except Exception as e:
        # Log but don't fail — Gmail needs a 200 to stop retrying
        print(f"Failed to forward signal: {e}")

    return {"ok": True}


def _parse_org_from_subscription(subscription: str) -> str | None:
    import re
    m = re.search(r"/orgs/([a-f0-9-]+)/", subscription)
    return m.group(1) if m else None


# ── Simulate endpoint (dev) ────────────────────────────────────────────────────

class SimulateEmailPayload(BaseModel):
    org_id: str
    from_email: str = "prospect@company.com"
    from_name: str = "Alex Prospect"
    to_email: str = "rep@lanara.app"
    subject: str = "Interest in enterprise plan"
    body: str = "Hi, I saw your platform and would love to learn more about the enterprise tier. We have about 200 sales reps and are looking to move off Salesforce. Can we set up a call this week?"
    opportunity_id: str | None = None
    account_id: str | None = None


@app.post("/simulate")
async def simulate_email(payload: SimulateEmailPayload):
    """Inject a test email signal into the backend pipeline."""
    signal_payload = {
        "source": "gmail",
        "event_type": "email_received",
        "payload": {
            "thread_id": f"sim_{secrets.token_hex(8)}",
            "from_email": payload.from_email,
            "from_name": payload.from_name,
            "to_email": payload.to_email,
            "subject": payload.subject,
            "body": payload.body,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "opportunity_id": payload.opportunity_id,
            "account_id": payload.account_id,
        },
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/api/signals/ingest",
            json=signal_payload,
            headers={"X-Org-Id": payload.org_id, "X-Mcp-Source": "email"},
        )
        return {"ok": resp.status_code < 400, "backend_status": resp.status_code, "signal": signal_payload}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "mcp-email", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=MCP_PORT)
