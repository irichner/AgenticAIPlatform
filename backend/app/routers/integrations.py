"""Google Drive OAuth integration endpoints."""
from __future__ import annotations
import os
import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db
from app.models.google_token import GoogleOAuthToken

router = APIRouter(prefix="/integrations/google-drive", tags=["integrations"])

GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:3000/api/integrations/google-drive/callback",
)
SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
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


async def _get_or_create_token_row(db: AsyncSession) -> GoogleOAuthToken:
    result = await db.execute(select(GoogleOAuthToken).limit(1))
    row = result.scalar_one_or_none()
    if row is None:
        row = GoogleOAuthToken()
        db.add(row)
    return row


@router.get("/auth-url")
async def get_auth_url(db: AsyncSession = Depends(get_db)):
    """Generate a Google OAuth authorization URL."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=400,
            detail="GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment.",
        )
    try:
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI)
        state = secrets.token_urlsafe(32)
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
        # Store state + PKCE code_verifier together so the callback can reconstruct the flow
        code_verifier = getattr(flow, "code_verifier", None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build auth URL: {exc}")

    row = await _get_or_create_token_row(db)
    row.oauth_state = json.dumps({"state": state, "code_verifier": code_verifier})
    await db.commit()

    return {"auth_url": auth_url}


@router.get("/callback")
async def oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback, exchange code for tokens."""
    close_script = """
<html><body><script>
  if (window.opener) {
    window.opener.postMessage({type:'google-drive-connected'}, '*');
    window.close();
  } else {
    window.location.href = '/admin?tab=mcp';
  }
</script></body></html>
"""
    error_script = lambda msg: f"""
<html><body><script>
  if (window.opener) {{
    window.opener.postMessage({{type:'google-drive-error', error:{json.dumps(msg)}}}, '*');
    window.close();
  }} else {{
    document.body.innerText = 'Error: {msg}';
  }}
</script></body></html>
"""

    if error:
        return HTMLResponse(error_script(error))
    if not code:
        return HTMLResponse(error_script("No authorization code received"))

    result = await db.execute(select(GoogleOAuthToken).limit(1))
    row = result.scalar_one_or_none()

    # oauth_state is stored as JSON: {"state": "...", "code_verifier": "..."}
    stored_state: str | None = None
    stored_verifier: str | None = None
    if row and row.oauth_state:
        try:
            parsed = json.loads(row.oauth_state)
            stored_state    = parsed.get("state")
            stored_verifier = parsed.get("code_verifier")
        except (json.JSONDecodeError, AttributeError):
            stored_state = row.oauth_state  # legacy plain string

    if not row or (state and stored_state != state):
        return HTMLResponse(error_script("Invalid OAuth state — please try connecting again"))

    try:
        from google_auth_oauthlib.flow import Flow
        import httpx

        flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI, state=stored_state)
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
async def get_status(db: AsyncSession = Depends(get_db)):
    """Return Google Drive connection status."""
    result = await db.execute(select(GoogleOAuthToken).limit(1))
    row = result.scalar_one_or_none()
    connected = bool(row and row.refresh_token)
    return {"connected": connected, "email": row.user_email if connected else None}


@router.delete("")
async def disconnect(db: AsyncSession = Depends(get_db)):
    """Revoke Google Drive access and delete stored tokens."""
    result = await db.execute(select(GoogleOAuthToken).limit(1))
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
async def get_access_token(db: AsyncSession = Depends(get_db)):
    """Return a valid access token, refreshing if expired. Used internally by the MCP server."""
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
