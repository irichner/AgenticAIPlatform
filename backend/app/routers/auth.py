from __future__ import annotations
import logging
import os

logger = logging.getLogger(__name__)
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db
from app.auth.dependencies import current_user
from app.auth.magic_link import create_magic_link, consume_magic_link
from app.auth.email import send_magic_link
from app.auth.rate_limit import check_magic_link_rate
from app.auth.session import create_session, revoke_session
from app.models.user import User
from app.models.org import Org
from app.models.membership import OrgMembership, TenantMembership
from app.models.tenant_model import OrgTenant
from app.models.role import Role
from app.models.session_model import Session
from app.models.sso import OrgEmailDomain
from app.schemas.auth import MagicLinkRequest, MagicLinkResponse, MeOut, MeOrg, MePatch, SessionOut

router = APIRouter(prefix="/auth", tags=["auth"])

_ORG_MEMBER_ROLE_ID = UUID("00000000-0000-0000-0000-000000000003")


_TN_EDITOR_ROLE_ID = UUID("00000000-0000-0000-0000-000000000005")


async def _domain_auto_join(db: AsyncSession, user: User) -> bool:
    """If the user's email domain matches a registered OrgEmailDomain, add them as a member.

    Returns True if the user was joined to an org, False otherwise.
    """
    domain = user.email.lower().split("@")[-1]
    result = await db.execute(
        select(OrgEmailDomain).where(OrgEmailDomain.domain == domain)
    )
    domain_record = result.scalar_one_or_none()
    if domain_record is None:
        return False

    existing = await db.execute(
        select(OrgMembership).where(
            OrgMembership.org_id == domain_record.org_id,
            OrgMembership.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return False  # already a member

    db.add(OrgMembership(
        org_id=domain_record.org_id,
        user_id=user.id,
        role_id=_ORG_MEMBER_ROLE_ID,
    ))

    # Add to the org's default tenant so the user has immediate access
    tenant_result = await db.execute(
        select(OrgTenant).where(OrgTenant.org_id == domain_record.org_id).limit(1)
    )
    tenant = tenant_result.scalar_one_or_none()
    if tenant:
        db.add(TenantMembership(
            tenant_id=tenant.id,
            user_id=user.id,
            role_id=_TN_EDITOR_ROLE_ID,
        ))

    # Skip the setup wizard — this user is joining an existing org, not creating one
    user.onboarding_completed = True

    logger.info("domain_auto_join: added %s to org %s", user.email, domain_record.org_id)
    return True

_APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:3000")
_API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "http://localhost:3000")
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
    try:
        await send_magic_link(email, link, purpose="login", db=db)
    except Exception as exc:
        logger.error("Failed to send magic link to %s: %s", email, exc)
        raise HTTPException(503, "Email delivery failed — please try again later")

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

    # Invite flow: add to org
    if ml.purpose == "invite" and ml.org_id and ml.role_id:
        existing = await db.get(OrgMembership, (ml.org_id, user.id))
        if not existing:
            db.add(OrgMembership(org_id=ml.org_id, user_id=user.id, role_id=ml.role_id))

    # Domain auto-join: if the user's email domain matches a registered org domain
    domain_joined = await _domain_auto_join(db, user)

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
    # New users with no org (no invite, no domain match) go through the onboarding wizard
    dest = (
        f"{_APP_BASE_URL}/onboarding"
        if is_new and ml.purpose != "invite" and not domain_joined
        else f"{_APP_BASE_URL}/"
    )
    from starlette.responses import RedirectResponse
    redirect = RedirectResponse(url=dest, status_code=302)
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


async def _build_me_out(user: User, db: AsyncSession) -> MeOut:
    from app.auth.resolver import get_user_permissions
    result = await db.execute(
        select(OrgMembership, Role, Org)
        .join(Role, Role.id == OrgMembership.role_id)
        .join(Org, Org.id == OrgMembership.org_id)
        .where(OrgMembership.user_id == user.id)
    )
    rows = result.fetchall()
    orgs = [
        MeOrg(id=org.id, name=org.name, slug=org.slug, logo_url=org.logo_url, role_key=role.key)
        for _, role, org in rows
    ]
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
        job_title=getattr(user, "job_title", None),
        onboarding_completed=getattr(user, "onboarding_completed", False),
        orgs=orgs,
        permissions=permissions,
    )


@router.get("/me", response_model=MeOut)
async def get_me(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> MeOut:
    return await _build_me_out(user, db)


@router.patch("/me", response_model=MeOut)
async def update_me(
    body: MePatch,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> MeOut:
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.job_title is not None:
        user.job_title = body.job_title
    if body.onboarding_completed is not None:
        user.onboarding_completed = body.onboarding_completed
    await db.commit()
    await db.refresh(user)
    return await _build_me_out(user, db)


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


# ── Google OAuth ──────────────────────────────────────────────────────────

@router.get("/google/authorize")
async def google_authorize(db: AsyncSession = Depends(get_db)) -> Response:
    from starlette.responses import RedirectResponse
    from app.auth.google_oauth import build_authorize_url, save_state

    url, state = await build_authorize_url(db=db)
    await save_state(state)
    return RedirectResponse(url=url)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> Response:
    from starlette.responses import RedirectResponse
    from app.auth.google_oauth import consume_state, fetch_userinfo

    if error or not code or not state:
        return RedirectResponse(url=f"{_APP_BASE_URL}/login?error=google_denied")

    if not await consume_state(state):
        raise HTTPException(400, "Invalid OAuth state")

    try:
        userinfo = await fetch_userinfo(code, db=db)
    except Exception as exc:
        logger.error("Google OAuth exchange failed: %s", exc)
        raise HTTPException(502, "Failed to exchange OAuth code")

    email = userinfo.get("email", "").lower().strip()
    if not email or not userinfo.get("verified_email"):
        raise HTTPException(400, "Google account email not verified")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    is_new = user is None

    if is_new:
        user = User(
            email=email,
            full_name=userinfo.get("name"),
            avatar_url=userinfo.get("picture"),
            email_verified=True,
        )
        db.add(user)
        await db.flush()
    else:
        user.email_verified = True
        user.last_login_at = datetime.now(timezone.utc)
        if userinfo.get("name") and not user.full_name:
            user.full_name = userinfo["name"]
        if userinfo.get("picture") and not user.avatar_url:
            user.avatar_url = userinfo["picture"]

    # Domain auto-join: if the user's email domain matches a registered org domain
    domain_joined = await _domain_auto_join(db, user)

    await db.commit()

    sid = await create_session(
        db,
        user.id,
        user_agent=request.headers.get("user-agent"),
        ip=request.client.host if request.client else None,
    )

    dest = f"{_APP_BASE_URL}/onboarding" if is_new and not domain_joined else f"{_APP_BASE_URL}/"
    redirect = RedirectResponse(url=dest, status_code=302)
    redirect.set_cookie(
        key="sid",
        value=sid,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        domain=_COOKIE_DOMAIN,
        max_age=30 * 24 * 3600,
    )
    return redirect


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

    # Auto-seed the owner's email domain so teammates with the same domain auto-join
    domain = user.email.lower().split("@")[-1]
    db.add(OrgEmailDomain(org_id=org.id, domain=domain))
