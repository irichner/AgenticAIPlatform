from __future__ import annotations
import os
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.dependencies import get_db
from app.auth.context import AuthContext
from app.auth.dependencies import current_user, optional_user
from app.auth.magic_link import create_magic_link, consume_magic_link
from app.auth.email import send_magic_link
from app.auth.rate_limit import check_magic_link_rate
from app.auth.session import create_session, revoke_session, validate_session
from app.models.user import User
from app.models.org import Org
from app.models.membership import OrgMembership, TenantMembership
from app.models.tenant_model import OrgTenant
from app.models.role import Role
from app.models.session_model import Session
from app.schemas.auth import MagicLinkRequest, MagicLinkResponse, MeOut, MeOrg, SessionOut

router = APIRouter(prefix="/auth", tags=["auth"])

_APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:3000")
# Public URL of the backend API as seen from the user's browser (for email links)
_API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "http://localhost:8000")
_COOKIE_SECURE = os.getenv("ENV", "development") == "production"
_COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", None)
_PREFLIGHT_MINUTES = 15


@router.post("/magic-link", response_model=MagicLinkResponse)
async def request_magic_link(
    body: MagicLinkRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> MagicLinkResponse:
    email = body.email.lower().strip()
    ip = request.client.host if request.client else None

    allowed, reason = await check_magic_link_rate(email, ip)
    if not allowed:
        raise HTTPException(429, reason)

    token, pre_flight_id = await create_magic_link(db, email, purpose="login")

    link = f"{_API_PUBLIC_URL}/api/auth/verify?token={token}"
    await send_magic_link(email, link, purpose="login")

    # Pre-flight cookie — binds this link to the originating browser
    response.set_cookie(
        key="preflight",
        value=pre_flight_id,
        max_age=_PREFLIGHT_MINUTES * 60,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        domain=_COOKIE_DOMAIN,
    )
    return MagicLinkResponse()


@router.get("/verify")
async def verify_magic_link(
    token: str,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Response:
    pre_flight_id = request.cookies.get("preflight")
    ml = await consume_magic_link(db, token, pre_flight_id)
    if not ml:
        raise HTTPException(400, "Invalid or expired magic link")

    # Upsert user
    result = await db.execute(select(User).where(User.email == ml.email))
    user = result.scalar_one_or_none()
    is_new = user is None

    if is_new:
        user = User(email=ml.email, email_verified=True)
        db.add(user)
        await db.flush()
    else:
        user.email_verified = True
        user.last_login_at = datetime.now(timezone.utc)

    # First-ever user: auto-create org + default tenant + owner role
    if is_new:
        await _bootstrap_org(db, user)

    # Invite flow: add to org
    if ml.purpose == "invite" and ml.org_id and ml.role_id:
        existing = await db.get(OrgMembership, (ml.org_id, user.id))
        if not existing:
            db.add(OrgMembership(org_id=ml.org_id, user_id=user.id, role_id=ml.role_id))

    await db.commit()

    sid = await create_session(
        db,
        user.id,
        user_agent=request.headers.get("user-agent"),
        ip=request.client.host if request.client else None,
    )

    response.delete_cookie("preflight")
    response.set_cookie(
        key="sid",
        value=sid,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        domain=_COOKIE_DOMAIN,
        max_age=30 * 24 * 3600,
    )
    # Redirect to the app
    from starlette.responses import RedirectResponse
    redirect = RedirectResponse(url=f"{_APP_BASE_URL}/", status_code=302)
    redirect.set_cookie(
        key="sid",
        value=sid,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        domain=_COOKIE_DOMAIN,
        max_age=30 * 24 * 3600,
    )
    redirect.delete_cookie("preflight")
    return redirect


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    sid: str | None = request.scope.get("auth_sid") or request.cookies.get("sid")
    if sid:
        await revoke_session(sid, db)
    response.delete_cookie("sid")
    return {"detail": "Logged out"}


@router.get("/me", response_model=MeOut)
async def get_me(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> MeOut:
    from app.auth.resolver import get_user_permissions
    result = await db.execute(
        select(OrgMembership, Role, Org)
        .join(Role, Role.id == OrgMembership.role_id)
        .join(Org, Org.id == OrgMembership.org_id)
        .where(OrgMembership.user_id == user.id)
    )
    rows = result.fetchall()
    orgs = [
        MeOrg(id=org.id, name=org.name, slug=org.slug, role_key=role.key)
        for _, role, org in rows
    ]

    # Resolve permissions for all orgs (cached via Redis, ~60 s TTL)
    permissions: dict[str, list[str]] = {}
    for _, role, org in rows:
        perms = await get_user_permissions(db, user.id, "org", org.id)
        permissions[f"org:{org.id}"] = list(perms)

    return MeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=getattr(user, "avatar_url", None),
        email_verified=getattr(user, "email_verified", False),
        orgs=orgs,
        permissions=permissions,
    )


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    request: Request,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SessionOut]:
    result = await db.execute(
        select(Session)
        .where(Session.user_id == user.id)
        .order_by(Session.last_seen_at.desc())
    )
    sessions = result.scalars().all()
    current_sid = request.scope.get("auth_sid")
    return [
        SessionOut(
            id=s.id,
            created_at=s.created_at,
            last_seen_at=s.last_seen_at,
            expires_at=s.expires_at,
            user_agent=s.user_agent,
            ip=str(s.ip) if s.ip else None,
            is_current=(s.id == current_sid),
        )
        for s in sessions
    ]


@router.delete("/sessions/{session_id}")
async def revoke_session_endpoint(
    session_id: str,
    request: Request,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    await revoke_session(session_id, db)
    return {"detail": "Session revoked"}


# ── Internal helper ────────────────────────────────────────────────────────

async def _bootstrap_org(db: AsyncSession, user: User) -> None:
    """Create default org + tenant + assign owner role for first-ever user."""
    import re
    base_slug = re.sub(r"[^a-z0-9-]", "-", user.email.split("@")[0].lower())[:40]
    slug = base_slug

    # Owner role ID is deterministic from the migration
    _ORG_OWNER_ROLE_ID = UUID("00000000-0000-0000-0000-000000000001")
    _TN_ADMIN_ROLE_ID  = UUID("00000000-0000-0000-0000-000000000004")

    org = Org(name=f"{user.email.split('@')[0]}'s Org", slug=slug)
    db.add(org)
    await db.flush()

    tenant = OrgTenant(org_id=org.id, name="Default", slug="default")
    db.add(tenant)
    await db.flush()

    db.add(OrgMembership(org_id=org.id, user_id=user.id, role_id=_ORG_OWNER_ROLE_ID))
    db.add(TenantMembership(tenant_id=tenant.id, user_id=user.id, role_id=_TN_ADMIN_ROLE_ID))
