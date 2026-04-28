from __future__ import annotations
import os
import secrets
import urllib.parse

import httpx

from app.core.redis_client import get_redis

_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:3000/api/auth/google/callback",
)

_STATE_TTL = 600  # 10 minutes

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def build_authorize_url() -> tuple[str, str]:
    state = secrets.token_urlsafe(32)
    qs = urllib.parse.urlencode({
        "client_id": _CLIENT_ID,
        "redirect_uri": _REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
    })
    return f"{_AUTH_URL}?{qs}", state


async def save_state(state: str) -> None:
    redis = get_redis()
    await redis.setex(f"oauth:state:{state}", _STATE_TTL, "1")


async def consume_state(state: str) -> bool:
    redis = get_redis()
    key = f"oauth:state:{state}"
    val = await redis.get(key)
    if not val:
        return False
    await redis.delete(key)
    return True


async def fetch_userinfo(code: str) -> dict:
    """Exchange authorization code for Google user info."""
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(_TOKEN_URL, data={
            "code": code,
            "client_id": _CLIENT_ID,
            "client_secret": _CLIENT_SECRET,
            "redirect_uri": _REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        user_resp = await client.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_resp.raise_for_status()
        return user_resp.json()
