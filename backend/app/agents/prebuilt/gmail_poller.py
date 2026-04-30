"""Gmail polling agent — runs inside the backend process.

Every GMAIL_POLL_INTERVAL_SECONDS (default 5 min) it:
  1. Finds all users with a connected Google account (has refresh_token)
  2. Gets or refreshes their access token
  3. Fetches Gmail threads newer than that user's last-seen cursor
  4. Deduplicates via per-user Redis set of seen thread IDs
  5. Creates a SignalEvent for each new thread (tagged with user_id)
     → activity logger picks it up and attributes activity to the right rep
"""
from __future__ import annotations
import asyncio
import json
import os
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from uuid import UUID

import httpx

from app.core.redis_client import get_redis

POLL_INTERVAL = int(os.getenv("GMAIL_POLL_INTERVAL_SECONDS", str(5 * 60)))
# Env-var fallbacks for Google credentials
_GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
_GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
TOKEN_URI = "https://oauth2.googleapis.com/token"


async def _load_google_credentials(db, org_id: str) -> tuple[str, str]:
    """Return (client_id, client_secret) from platform settings with env fallbacks."""
    from uuid import UUID as _UUID
    from app.core.settings_service import get_setting
    oid = _UUID(org_id)
    client_id = await get_setting(db, oid, "google_client_id") or _GOOGLE_CLIENT_ID
    client_secret = await get_setting(db, oid, "google_client_secret") or _GOOGLE_CLIENT_SECRET
    return client_id, client_secret


# ── Token helpers ─────────────────────────────────────────────────────────────

async def _refresh_access_token(refresh_token: str, client_id: str, client_secret: str) -> tuple[str, datetime] | None:
    """Exchange a refresh token for a fresh access token. Returns (token, expiry) or None."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(TOKEN_URI, data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            })
        data = resp.json()
        if "access_token" not in data:
            print(f"[gmail_poller] token refresh failed: {data.get('error', 'unknown')} — {data.get('error_description', '')}")
            return None
        expires_in = int(data.get("expires_in", 3600))
        expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
        return data["access_token"], expiry
    except Exception:
        return None


async def _get_valid_token(row, db) -> str | None:
    """Return a usable access token for the given GoogleOAuthToken row, refreshing if needed."""
    now = datetime.now(timezone.utc)
    expiry = row.token_expiry
    if expiry and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    if row.access_token and expiry and expiry > now:
        return row.access_token

    if not row.refresh_token:
        return None

    client_id, client_secret = await _load_google_credentials(db, str(row.org_id))
    result = await _refresh_access_token(row.refresh_token, client_id, client_secret)
    if not result:
        return None

    access_token, new_expiry = result
    row.access_token = access_token
    row.token_expiry = new_expiry
    await db.commit()
    return access_token


# ── Cursor (Redis) — keyed per (org_id, user_id) ─────────────────────────────

def _key(prefix: str, org_id: str, user_id: str) -> str:
    return f"{prefix}:{org_id}:{user_id}"


async def _get_cursor(org_id: str, user_id: str) -> int:
    val = await get_redis().get(_key("gmail_poll_cursor", org_id, user_id))
    if val:
        return int(val)
    return int((datetime.now(timezone.utc) - timedelta(days=7)).timestamp())


async def _set_cursor(org_id: str, user_id: str, epoch: int) -> None:
    await get_redis().set(_key("gmail_poll_cursor", org_id, user_id), str(epoch), ex=60 * 24 * 3600)


async def _get_page_token(org_id: str, user_id: str) -> str | None:
    return await get_redis().get(_key("gmail_page_token", org_id, user_id))


async def _set_page_token(org_id: str, user_id: str, token: str | None) -> None:
    r = get_redis()
    key = _key("gmail_page_token", org_id, user_id)
    if token:
        await r.set(key, token, ex=7 * 24 * 3600)
    else:
        await r.delete(key)


async def _is_seen(org_id: str, user_id: str, thread_id: str) -> bool:
    return bool(await get_redis().sismember(_key("gmail_seen", org_id, user_id), thread_id))


async def _mark_seen(org_id: str, user_id: str, thread_ids: list[str]) -> None:
    if not thread_ids:
        return
    r = get_redis()
    key = _key("gmail_seen", org_id, user_id)
    pipe = r.pipeline()
    pipe.sadd(key, *thread_ids)
    pipe.expire(key, 90 * 24 * 3600)  # 90-day dedup window
    await pipe.execute()


# ── Gmail fetch ───────────────────────────────────────────────────────────────

async def _fetch_threads(
    access_token: str,
    after_epoch: int | None = None,
    page_token: str | None = None,
    max_results: int = 25,
) -> tuple[list[dict], str | None]:
    """Fetch thread metadata from Gmail. Returns (threads, next_page_token)."""
    try:
        async with httpx.AsyncClient(
            base_url="https://gmail.googleapis.com/gmail/v1",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30,
        ) as client:
            BASE_QUERY = "-from:me in:inbox -in:spam -in:trash -category:promotions"
            params: dict = {"maxResults": max_results}
            if page_token:
                params["pageToken"] = page_token
            elif after_epoch is not None:
                params["q"] = f"after:{after_epoch} {BASE_QUERY}"
            else:
                params["q"] = BASE_QUERY

            resp = await client.get("/users/me/threads", params=params)
            if resp.status_code == 403:
                err = resp.json().get("error", {})
                if "insufficientPermissions" in str(err) or "scope" in str(err).lower():
                    print("[gmail_poller] Token lacks Gmail scope — reconnect Google in Integrations")
                return [], None
            if resp.status_code != 200:
                print(f"[gmail_poller] Gmail API error {resp.status_code}: {resp.text[:200]}")
                return [], None

            body = resp.json()
            thread_stubs = body.get("threads", [])
            next_page_token = body.get("nextPageToken")

            threads = []
            for stub in thread_stubs:
                detail = await client.get(
                    f"/users/me/threads/{stub['id']}",
                    params={"format": "metadata", "metadataHeaders": ["Subject", "From", "To", "Date", "Cc", "List-Unsubscribe"]},
                )
                if detail.status_code == 200:
                    threads.append(detail.json())
            return threads, next_page_token
    except Exception as e:
        print(f"[gmail_poller] fetch error: {e}")
        return [], None


def _build_signal_payload(thread: dict) -> dict:
    """Extract a clean signal payload from a Gmail thread.
    Returns {} to signal the thread should be skipped."""
    messages = thread.get("messages", [])
    if not messages:
        return {}

    first_msg = messages[0]
    last_msg = messages[-1]

    def headers(msg: dict) -> dict:
        return {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}

    h_first = headers(first_msg)
    h_last = headers(last_msg)

    if any("list-unsubscribe" in headers(m) for m in messages):
        return {}

    raw_date = h_last.get("date", "")
    try:
        occurred_at = parsedate_to_datetime(raw_date).astimezone(timezone.utc).isoformat()
    except Exception:
        occurred_at = datetime.now(timezone.utc).isoformat()

    return {
        "thread_id": thread["id"],
        "subject": h_first.get("subject", "(no subject)"),
        "from_email": h_last.get("from", ""),
        "to_email": h_last.get("to", ""),
        "cc_email": h_last.get("cc", ""),
        "snippet": last_msg.get("snippet", ""),
        "message_count": len(messages),
        "body": last_msg.get("snippet", ""),
        "occurred_at": occurred_at,
    }


# ── Per-user poll ─────────────────────────────────────────────────────────────

async def _poll_user(org_id: str, user_id: str, token_row, db) -> int:
    """Poll Gmail for one user. Returns number of new signals created."""
    from app.models.signals import Signal
    from app.db.rls import set_rls_org
    await set_rls_org(db, org_id)

    access_token = await _get_valid_token(token_row, db)
    if not access_token:
        print(f"[gmail_poller] org={org_id} user={user_id} — no valid token (expired/refresh failed), skipping")
        return 0

    page_token = await _get_page_token(org_id, user_id)
    after_epoch = None if page_token else await _get_cursor(org_id, user_id)

    threads, next_page_token = await _fetch_threads(
        access_token, after_epoch=after_epoch, page_token=page_token
    )
    if not threads:
        await _set_page_token(org_id, user_id, None)
        await _set_cursor(org_id, user_id, int(datetime.now(timezone.utc).timestamp()))
        print(f"[gmail_poller] org={org_id} user={user_id} — 0 threads found (after_epoch={after_epoch})")
        return 0

    new_count = 0
    new_thread_ids = []

    for thread in threads:
        thread_id = thread.get("id", "")
        if not thread_id:
            continue
        if await _is_seen(org_id, user_id, thread_id):
            continue

        payload = _build_signal_payload(thread)
        if not payload:
            continue

        # Tag the signal with user_id so the activity logger attributes it to the right rep
        payload["rep_user_id"] = user_id

        event = Signal(
            org_id=UUID(org_id),
            source="gmail",
            event_type="email_received",
            payload=payload,
            status="pending",
        )
        db.add(event)
        new_thread_ids.append(thread_id)
        new_count += 1

    if new_count > 0:
        await db.commit()
        await _mark_seen(org_id, user_id, new_thread_ids)

    if next_page_token:
        await _set_page_token(org_id, user_id, next_page_token)
        print(f"[gmail_poller] org={org_id} user={user_id} fetched {len(threads)} threads, more pages remain")
    else:
        await _set_page_token(org_id, user_id, None)
        await _set_cursor(org_id, user_id, int(datetime.now(timezone.utc).timestamp()))
        print(f"[gmail_poller] org={org_id} user={user_id} backfill complete, cursor at now")

    return new_count


# ── Main loop ─────────────────────────────────────────────────────────────────

async def run_gmail_poller_loop() -> None:
    """Background loop: poll Gmail for all connected users every POLL_INTERVAL seconds."""
    from app.db.engine import AsyncSessionLocal
    from app.models.google_token import GoogleOAuthToken
    from sqlalchemy import select

    await asyncio.sleep(30)  # startup delay

    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(GoogleOAuthToken).where(
                        GoogleOAuthToken.refresh_token.isnot(None),
                        GoogleOAuthToken.user_id.isnot(None),
                    )
                )
                token_rows = result.scalars().all()

            for token_row in token_rows:
                if not token_row.org_id or not token_row.user_id:
                    continue
                try:
                    oid = str(token_row.org_id)
                    uid = str(token_row.user_id)

                    # Respect the user's personal interval — skip if not due yet.
                    # _get_cursor defaults to 7 days ago on first run, so cursor_age
                    # starts very large and the first poll always runs.
                    user_interval = (token_row.poll_interval_minutes * 60) if token_row.poll_interval_minutes else POLL_INTERVAL
                    last_poll = await _get_cursor(oid, uid)
                    now_epoch = int(datetime.now(timezone.utc).timestamp())
                    if (now_epoch - last_poll) < user_interval:
                        continue

                    async with AsyncSessionLocal() as db:
                        res = await db.execute(
                            select(GoogleOAuthToken).where(GoogleOAuthToken.id == token_row.id)
                        )
                        fresh_row = res.scalar_one_or_none()
                        if fresh_row and fresh_row.user_id:
                            count = await _poll_user(
                                oid,
                                uid,
                                fresh_row,
                                db,
                            )
                            if count:
                                print(f"[gmail_poller] org={oid} user={uid} ingested {count} new thread(s)")
                except Exception as e:
                    print(f"[gmail_poller] error polling org={token_row.org_id} user={token_row.user_id}: {e}")

        except Exception as e:
            print(f"[gmail_poller] loop error: {e}")

        await asyncio.sleep(POLL_INTERVAL)
