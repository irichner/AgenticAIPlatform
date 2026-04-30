"""Google Account OAuth integration endpoints (Drive + Gmail) — per-user tokens."""
from __future__ import annotations
import os
import json
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth.dependencies import resolve_org, current_user
from app.dependencies import get_db
from app.models.google_token import GoogleOAuthToken
from app.models.user import User

router = APIRouter(prefix="/integrations/google", tags=["integrations"])

# Env-var fallbacks — overridden per-request from platform settings when org context is available
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv(
    "GOOGLE_INTEGRATION_REDIRECT_URI",
    os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/integrations/google/callback"),
)


async def _get_google_integration_config(db: AsyncSession, org_id: UUID) -> tuple[str, str, str]:
    """Return (client_id, client_secret, redirect_uri) from DB settings with env fallbacks."""
    from app.core.settings_service import get_setting
    client_id = await get_setting(db, org_id, "google_client_id") or GOOGLE_CLIENT_ID
    client_secret = await get_setting(db, org_id, "google_client_secret") or GOOGLE_CLIENT_SECRET
    redirect_uri = (
        await get_setting(db, org_id, "google_integration_redirect_uri")
        or await get_setting(db, org_id, "google_redirect_uri")
        or GOOGLE_REDIRECT_URI
    )
    return client_id, client_secret, redirect_uri
SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
]

TOKEN_URI = "https://oauth2.googleapis.com/token"


def _client_config(client_id: str, client_secret: str, redirect_uri: str) -> dict:
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": TOKEN_URI,
            "redirect_uris": [redirect_uri],
        }
    }


async def _get_or_create_token_row(
    db: AsyncSession, org_id: UUID, user_id: UUID
) -> GoogleOAuthToken:
    result = await db.execute(
        select(GoogleOAuthToken).where(
            GoogleOAuthToken.org_id == org_id,
            GoogleOAuthToken.user_id == user_id,
        ).limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = GoogleOAuthToken(org_id=org_id, user_id=user_id)
        db.add(row)
    return row


@router.get("/auth-url")
async def get_auth_url(
    org_id: UUID = Depends(resolve_org),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a Google OAuth authorization URL for the current user."""
    client_id, client_secret, redirect_uri = await _get_google_integration_config(db, org_id)
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="Google OAuth credentials are not configured. Set them in Admin → Settings → Platform.",
        )
    try:
        from google_auth_oauthlib.flow import Flow
        random_state = secrets.token_urlsafe(32)
        # State encodes: "{random}|{org_id}|{user_id}" so the callback can restore context.
        google_state = f"{random_state}|{str(org_id)}|{str(user.id)}"
        flow = Flow.from_client_config(
            _client_config(client_id, client_secret, redirect_uri), scopes=SCOPES, redirect_uri=redirect_uri
        )
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=google_state,
        )
        code_verifier = getattr(flow, "code_verifier", None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build auth URL: {exc}")

    row = await _get_or_create_token_row(db, org_id, user.id)
    row.oauth_state = json.dumps({"state": random_state, "code_verifier": code_verifier})
    await db.commit()

    return {"auth_url": auth_url}


@router.get("/callback")
async def oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth callback, exchange code for tokens."""
    close_script = """
<html><body><script>
  try { localStorage.setItem('google-oauth-result', JSON.stringify({type:'connected',ts:Date.now()})); } catch(e) {}
  if (window.opener) {
    try { window.opener.postMessage({type:'google-drive-connected'}, '*'); } catch(e) {}
  }
  setTimeout(function() {
    try { window.close(); } catch(e) {}
    document.body.innerHTML = '<p style="font-family:sans-serif;padding:20px;color:#16a34a">Google connected! You can close this tab.</p>';
  }, 200);
</script></body></html>
"""
    error_script = lambda msg: f"""
<html><body><script>
  try {{ localStorage.setItem('google-oauth-result', JSON.stringify({{type:'error',error:{json.dumps(msg)},ts:Date.now()}})); }} catch(e) {{}}
  if (window.opener) {{
    try {{ window.opener.postMessage({{type:'google-drive-error', error:{json.dumps(msg)}}}, '*'); }} catch(e) {{}}
  }}
  setTimeout(function() {{
    try {{ window.close(); }} catch(e) {{}}
    document.body.innerHTML = '<p style="font-family:sans-serif;padding:20px;color:#dc2626">Error: {msg}. You can close this tab.</p>';
  }}, 200);
</script></body></html>
"""

    if error:
        return HTMLResponse(error_script(error))
    if not code:
        return HTMLResponse(error_script("No authorization code received"))

    # Extract "{random}|{org_id}|{user_id}" from state
    random_state = state
    callback_org_id: UUID | None = None
    callback_user_id: UUID | None = None
    if state and "|" in state:
        parts = state.split("|")
        random_state = parts[0]
        if len(parts) >= 2:
            try:
                callback_org_id = UUID(parts[1])
            except ValueError:
                pass
        if len(parts) >= 3:
            try:
                callback_user_id = UUID(parts[2])
            except ValueError:
                pass

    # Find the pending token row by (org_id, user_id) when both are known
    row: GoogleOAuthToken | None = None
    if callback_org_id and callback_user_id:
        res = await db.execute(
            select(GoogleOAuthToken).where(
                GoogleOAuthToken.org_id == callback_org_id,
                GoogleOAuthToken.user_id == callback_user_id,
            ).limit(1)
        )
        row = res.scalar_one_or_none()

    if row is None and callback_org_id:
        # Fallback: match by org_id + oauth_state value
        res = await db.execute(
            select(GoogleOAuthToken).where(GoogleOAuthToken.org_id == callback_org_id)
        )
        for candidate in res.scalars().all():
            if not candidate.oauth_state:
                continue
            try:
                parsed = json.loads(candidate.oauth_state)
                if parsed.get("state") == random_state:
                    row = candidate
                    break
            except Exception:
                pass

    if row is None:
        return HTMLResponse(error_script("OAuth session expired — please try connecting again"))

    stored_state: str | None = None
    stored_verifier: str | None = None
    if row.oauth_state:
        try:
            parsed = json.loads(row.oauth_state)
            stored_state    = parsed.get("state")
            stored_verifier = parsed.get("code_verifier")
        except (json.JSONDecodeError, AttributeError):
            stored_state = row.oauth_state

    if random_state and stored_state and stored_state != random_state:
        return HTMLResponse(error_script("Invalid OAuth state — please try connecting again"))

    try:
        from google_auth_oauthlib.flow import Flow
        import httpx

        if callback_org_id:
            cb_client_id, cb_client_secret, cb_redirect_uri = await _get_google_integration_config(db, callback_org_id)
        else:
            cb_client_id, cb_client_secret, cb_redirect_uri = GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
        flow = Flow.from_client_config(
            _client_config(cb_client_id, cb_client_secret, cb_redirect_uri), scopes=SCOPES, redirect_uri=cb_redirect_uri, state=stored_state
        )
        if stored_verifier:
            flow.code_verifier = stored_verifier
        flow.fetch_token(code=code)
        creds = flow.credentials

        user_email: str | None = None
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {creds.token}"},
                )
                if resp.status_code == 200:
                    user_email = resp.json().get("email")
        except Exception:
            pass

        row.access_token  = creds.token
        row.refresh_token = creds.refresh_token or row.refresh_token
        row.token_expiry  = creds.expiry
        row.user_email    = user_email
        row.scopes        = json.dumps(list(creds.scopes or []))
        row.oauth_state   = None
        await db.commit()

    except Exception as exc:
        return HTMLResponse(error_script(str(exc)))

    return HTMLResponse(close_script)


@router.get("/status")
async def get_status(
    org_id: UUID = Depends(resolve_org),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return Google connection status for the current user."""
    result = await db.execute(
        select(GoogleOAuthToken).where(
            GoogleOAuthToken.org_id == org_id,
            GoogleOAuthToken.user_id == user.id,
        ).limit(1)
    )
    row = result.scalar_one_or_none()
    connected = bool(row and row.refresh_token)
    return {
        "connected": connected,
        "email": row.user_email if connected else None,
        "poll_interval_minutes": row.poll_interval_minutes if connected else None,
    }


@router.delete("")
async def disconnect(
    org_id: UUID = Depends(resolve_org),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke the current user's Google access and delete their stored tokens."""
    result = await db.execute(
        select(GoogleOAuthToken).where(
            GoogleOAuthToken.org_id == org_id,
            GoogleOAuthToken.user_id == user.id,
        ).limit(1)
    )
    row = result.scalar_one_or_none()
    if row:
        if row.access_token:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=5.0) as client:
                    await client.post(
                        "https://oauth2.googleapis.com/revoke",
                        params={"token": row.access_token},
                    )
            except Exception:
                pass
        await db.delete(row)
        await db.commit()
    return {"ok": True}


class GoogleSettingsUpdate(BaseModel):
    poll_interval_minutes: int | None = None


@router.patch("/settings")
async def update_settings(
    payload: GoogleSettingsUpdate,
    org_id: UUID = Depends(resolve_org),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update per-user Gmail polling settings."""
    result = await db.execute(
        select(GoogleOAuthToken).where(
            GoogleOAuthToken.org_id == org_id,
            GoogleOAuthToken.user_id == user.id,
        ).limit(1)
    )
    row = result.scalar_one_or_none()
    if not row or not row.refresh_token:
        raise HTTPException(status_code=400, detail="Google not connected")

    if payload.poll_interval_minutes is not None:
        if payload.poll_interval_minutes < 1:
            raise HTTPException(status_code=422, detail="poll_interval_minutes must be >= 1")
        row.poll_interval_minutes = payload.poll_interval_minutes

    await db.commit()
    return {
        "connected": True,
        "email": row.user_email,
        "poll_interval_minutes": row.poll_interval_minutes,
    }


@router.get("/token")
async def get_access_token(request: Request, db: AsyncSession = Depends(get_db)):
    """Return a valid access token, refreshing if expired. Used internally by MCP servers.

    Scopes by (org_id, user_id) when both headers are present.
    Falls back to first token for org when only X-Org-Id is provided (legacy MCP calls).
    """
    raw_org_id  = request.headers.get("x-org-id")
    raw_user_id = request.headers.get("x-user-id")

    if raw_org_id and raw_user_id:
        try:
            token_org_id  = UUID(raw_org_id)
            token_user_id = UUID(raw_user_id)
            result = await db.execute(
                select(GoogleOAuthToken).where(
                    GoogleOAuthToken.org_id == token_org_id,
                    GoogleOAuthToken.user_id == token_user_id,
                ).limit(1)
            )
        except ValueError:
            result = await db.execute(select(GoogleOAuthToken).limit(1))
    elif raw_org_id:
        try:
            token_org_id = UUID(raw_org_id)
            result = await db.execute(
                select(GoogleOAuthToken).where(
                    GoogleOAuthToken.org_id == token_org_id,
                    GoogleOAuthToken.refresh_token.isnot(None),
                ).limit(1)
            )
        except ValueError:
            result = await db.execute(select(GoogleOAuthToken).limit(1))
    else:
        result = await db.execute(select(GoogleOAuthToken).limit(1))

    row = result.scalar_one_or_none()
    if not row or not row.refresh_token:
        raise HTTPException(status_code=401, detail="Google not connected")

    now = datetime.now(timezone.utc)
    expiry = row.token_expiry
    if expiry and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    needs_refresh = (not row.access_token) or (expiry and expiry <= now)
    if needs_refresh:
        try:
            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request as GoogleRequest
            creds = Credentials(
                token=row.access_token,
                refresh_token=row.refresh_token,
                token_uri=TOKEN_URI,
                client_id=GOOGLE_CLIENT_ID,
                client_secret=GOOGLE_CLIENT_SECRET,
                scopes=json.loads(row.scopes or "[]") or SCOPES,
            )
            creds.refresh(GoogleRequest())
            row.access_token = creds.token
            row.token_expiry = creds.expiry
            await db.commit()
        except Exception as exc:
            raise HTTPException(status_code=401, detail=f"Token refresh failed: {exc}")

    return {"access_token": row.access_token}
