"""Pure-ASGI session middleware.

Reads the `sid` cookie, resolves it against Redis (then Postgres on miss),
and injects `scope["auth_user_id"]` for the `current_user` dependency to pick up.
This never buffers the request body, so it is safe for SSE/streaming routes.
"""
from __future__ import annotations
from starlette.types import ASGIApp, Receive, Scope, Send
from app.db.engine import AsyncSessionLocal
from app.auth.session import validate_session


def _parse_sid(cookie_header: str) -> str | None:
    for part in cookie_header.split(";"):
        name, _, value = part.strip().partition("=")
        if name.strip() == "sid":
            return value.strip()
    return None


class SessionAuthMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            headers: dict[bytes, bytes] = dict(scope.get("headers", []))
            cookie_raw = headers.get(b"cookie", b"").decode("latin-1")
            sid = _parse_sid(cookie_raw)
            if sid:
                async with AsyncSessionLocal() as db:
                    user_id = await validate_session(sid, db)
                if user_id:
                    scope["auth_user_id"] = str(user_id)
                    scope["auth_sid"] = sid

        await self.app(scope, receive, send)
