"""Google Account OAuth integration endpoints (Drive + Gmail)."""
from __future__ import annotations
import os
import json
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth.dependencies import resolve_org
from app.dependencies import get_db
from app.models.google_token import GoogleOAuthToken

router = APIRouter(prefix="/integrations/google", tags=["integrations"])

GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv(
    "GOOGLE_INTEGRATION_REDIRECT_URI",
    os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/integrations/google/callback"),
)
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


def _client_config() -> dict:
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": TOKEN_URI,
            "redirect_uris": [GOOGLE_REDIRECT_URI],
        }
    }


async def _get_or_create_token_row(db: AsyncSession, org_id: UUID) -> GoogleOAuthToken:
    result = await db.execute(
        select(GoogleOAuthToken).where(GoogleOAuthToken.org_id == org_id).limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = GoogleOAuthToken(org_id=org_id)
        db.add(row)
    return row


@router.get("/auth-url")
async def get_auth_url(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    """Generate a Google OAuth authorization URL."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=400,
            detail="GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment.",
        )
    try:
        from google_auth_oauthlib.flow import Flow
        random_state = secrets.token_urlsafe(32)
        # Embed org_id in the state string so the callback can identify which org to update.
        # Google passes this value back verbatim, so we can recover it without session state.
        google_state = f"{random_state}|{str(org_id)}"
        flow = Flow.from_client_config(
            _client_config(), scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI
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

    row = await _get_or_create_token_row(db, org_id)
    # Store only the random part for state validation; org_id is on the row itself
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

    # Extract org_id and random_state from the combined state string "{random}|{org_id}"
    random_state = state
    callback_org_id: UUID | None = None
    if state and "|" in state:
        parts = state.rsplit("|", 1)
        random_state = parts[0]
        try:
            callback_org_id = UUID(parts[1])
        except ValueError:
            pass

    # Find the pending token row — prefer matching by org_id, fall back to oauth_state match
    row: GoogleOAuthToken | None = None
    if callback_org_id:
        res = await db.execute(
            select(GoogleOAuthToken).where(GoogleOAuthToken.org_id == callback_org_id).limit(1)
        )
        row = res.scalar_one_or_none()

    if row is None:
        # Fallback: find any row whose oauth_state matches the random_state portion
        res = await db.execute(select(GoogleOAuthToken))
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

        flow = Flow.from_client_config(
            _client_config(), scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI, state=stored_state
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
    db: AsyncSession = Depends(get_db),
):
    """Return Google Drive connection status."""
    result = await db.execute(
        select(GoogleOAuthToken).where(GoogleOAuthToken.org_id == org_id).limit(1)
    )
    row = result.scalar_one_or_none()
    connected = bool(row and row.refresh_token)
    return {"connected": connected, "email": row.user_email if connected else None}


@router.delete("")
async def disconnect(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    """Revoke Google Drive access and delete stored tokens."""
    result = await db.execute(
        select(GoogleOAuthToken).where(GoogleOAuthToken.org_id == org_id).limit(1)
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


@router.get("/token")
async def get_access_token(request: Request, db: AsyncSession = Depends(get_db)):
    """Return a valid access token, refreshing if expired. Used internally by the MCP server.

    Scopes by org when X-Org-Id is present; falls back to limit(1) for legacy MCP server calls.
    """
    raw_org_id = request.headers.get("x-org-id")
    if raw_org_id:
        try:
            token_org_id = UUID(raw_org_id)
            result = await db.execute(
                select(GoogleOAuthToken).where(GoogleOAuthToken.org_id == token_org_id).limit(1)
            )
        except ValueError:
            result = await db.execute(select(GoogleOAuthToken).limit(1))
    else:
        result = await db.execute(select(GoogleOAuthToken).limit(1))

    row = result.scalar_one_or_none()
    if not row or not row.refresh_token:
        raise HTTPException(status_code=401, detail="Google Drive not connected")

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
