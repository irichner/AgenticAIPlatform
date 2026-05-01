"""Phase 5 — OIDC SSO.

Supports Okta, Azure AD, Google Workspace, Auth0, and any compliant OIDC provider.
Requires:  pip install authlib
"""
from __future__ import annotations
import os
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.dependencies import get_db
from app.auth.dependencies import require_permission
from app.auth.context import AuthContext
from app.auth.permissions import P
from app.models.sso import OrgSsoConfig, OrgEmailDomain
from app.models.audit_log import AuditLog

router = APIRouter(prefix="/orgs", tags=["sso"])
_APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:3000")
_COOKIE_SECURE = os.getenv("ENV", "development") == "production"

# ── Schemas ───────────────────────────────────────────────────────────────

class SsoConfigIn(BaseModel):
    provider: str
    issuer_url: str
    client_id: str
    client_secret: str
    enabled: bool = True


class SsoConfigOut(BaseModel):
    org_id: str
    provider: str
    issuer_url: str
    client_id: str
    enabled: bool

    model_config = {"from_attributes": True}


# ── SSO config endpoints ──────────────────────────────────────────────────

@router.get("/{org_id}/sso", response_model=SsoConfigOut | None)
async def get_sso_config(
    ctx: AuthContext = Depends(require_permission(P.ORG_SSO_CONFIGURE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> SsoConfigOut | None:
    config = await db.get(OrgSsoConfig, ctx.scope_id)
    if not config:
        return None
    return SsoConfigOut(
        org_id=str(config.org_id),
        provider=config.provider,
        issuer_url=config.issuer_url,
        client_id=config.client_id,
        enabled=config.enabled,
    )


@router.put("/{org_id}/sso", response_model=SsoConfigOut)
async def upsert_sso_config(
    body: SsoConfigIn,
    ctx: AuthContext = Depends(require_permission(P.ORG_SSO_CONFIGURE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> SsoConfigOut:
    config = await db.get(OrgSsoConfig, ctx.scope_id)
    if config:
        config.provider = body.provider
        config.issuer_url = body.issuer_url
        config.client_id = body.client_id
        config.client_secret_ref = body.client_secret
        config.enabled = body.enabled
    else:
        config = OrgSsoConfig(
            org_id=ctx.scope_id,
            provider=body.provider,
            issuer_url=body.issuer_url,
            client_id=body.client_id,
            client_secret_ref=body.client_secret,
            enabled=body.enabled,
        )
        db.add(config)
    await db.commit()
    db.add(AuditLog(
        actor_user_id=ctx.user.id, org_id=ctx.scope_id,
        permission=P.ORG_SSO_CONFIGURE, action="sso.config.upsert",
        ip=ctx.ip, user_agent=ctx.user_agent,
    ))
    await db.flush()
    await db.commit()
    return SsoConfigOut(
        org_id=str(ctx.scope_id),
        provider=config.provider,
        issuer_url=config.issuer_url,
        client_id=config.client_id,
        enabled=config.enabled,
    )


# ── Email domain management ───────────────────────────────────────────────

class DomainIn(BaseModel):
    domain: str


class DomainOut(BaseModel):
    domain: str
    verified: bool
    verify_token: str | None


@router.get("/{org_id}/domains", response_model=list[DomainOut])
async def list_domains(
    ctx: AuthContext = Depends(require_permission(P.ORG_SSO_CONFIGURE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> list[DomainOut]:
    result = await db.execute(
        select(OrgEmailDomain).where(OrgEmailDomain.org_id == ctx.scope_id)
    )
    return [
        DomainOut(domain=d.domain, verified=d.verified, verify_token=d.verify_token)
        for d in result.scalars().all()
    ]


@router.post("/{org_id}/domains", status_code=201)
async def add_domain(
    body: DomainIn,
    ctx: AuthContext = Depends(require_permission(P.ORG_SSO_CONFIGURE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> DomainOut:
    domain = body.domain.lower().strip()
    existing = await db.get(OrgEmailDomain, domain)
    if existing:
        raise HTTPException(409, "Domain already registered")

    verify_token = f"lanara-verify={secrets.token_urlsafe(16)}"
    record = OrgEmailDomain(
        domain=domain, org_id=ctx.scope_id, verify_token=verify_token
    )
    db.add(record)
    await db.commit()
    return DomainOut(domain=domain, verified=False, verify_token=verify_token)


@router.post("/{org_id}/domains/{domain}/verify")
async def verify_domain(
    domain: str,
    ctx: AuthContext = Depends(require_permission(P.ORG_SSO_CONFIGURE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    record = await db.get(OrgEmailDomain, domain.lower())
    if not record or record.org_id != ctx.scope_id:
        raise HTTPException(404, "Domain not found")
    if record.verified:
        return {"detail": "Already verified"}

    # DNS TXT-record check
    verified = await _check_dns_txt(domain, record.verify_token or "")
    if not verified:
        raise HTTPException(400, "TXT record not found — DNS may need up to 24h to propagate")

    record.verified = True
    record.verified_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Domain verified"}


@router.delete("/{org_id}/domains/{domain}")
async def remove_domain(
    domain: str,
    ctx: AuthContext = Depends(require_permission(P.ORG_SSO_CONFIGURE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    record = await db.get(OrgEmailDomain, domain.lower())
    if not record or record.org_id != ctx.scope_id:
        raise HTTPException(404, "Domain not found")
    await db.delete(record)
    await db.commit()
    return {"detail": "Domain removed"}


# ── OIDC login + callback ─────────────────────────────────────────────────

auth_router = APIRouter(prefix="/auth/sso", tags=["sso"])


@auth_router.get("/login")
async def sso_login(
    email: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Detect SSO for this email's domain and return redirect URL."""
    domain = email.lower().split("@")[-1]
    domain_record = await db.get(OrgEmailDomain, domain)
    if not domain_record or not domain_record.verified:
        raise HTTPException(400, "No SSO configured for this domain")

    config = await db.get(OrgSsoConfig, domain_record.org_id)
    if not config or not config.enabled:
        raise HTTPException(400, "SSO not enabled for this org")

    try:
        from authlib.integrations.httpx_client import AsyncOAuth2Client
    except ImportError:
        raise HTTPException(501, "authlib not installed — run: pip install authlib")

    state = secrets.token_urlsafe(16)
    redirect_uri = f"{os.getenv('API_BASE_URL', 'http://localhost:8000')}/api/auth/sso/callback"

    client = AsyncOAuth2Client(
        client_id=config.client_id,
        client_secret=config.client_secret_ref,
        redirect_uri=redirect_uri,
        scope="openid email profile",
    )
    uri, state = client.create_authorization_url(
        f"{config.issuer_url}/authorize", state=state
    )
    return {"redirect_url": uri, "state": state}


@auth_router.get("/callback")
async def sso_callback(
    code: str,
    state: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Exchange OIDC code for tokens, JIT-provision user, issue session."""

    try:
        from authlib.integrations.httpx_client import AsyncOAuth2Client  # noqa: F401
    except ImportError:
        raise HTTPException(501, "authlib not installed")

    # Look up which org this callback belongs to via state cookie/session
    # For a production impl, store state→org_id in Redis.
    # Here we do a simple domain-based lookup from the "login_hint" in state.
    raise HTTPException(501, "SSO callback: store state in Redis before shipping to prod")


# ── DNS helper ────────────────────────────────────────────────────────────

async def _check_dns_txt(domain: str, expected_token: str) -> bool:
    try:
        import dns.resolver
        answers = dns.resolver.resolve(f"_lanara-verify.{domain}", "TXT")
        for rdata in answers:
            for txt in rdata.strings:
                if txt.decode("utf-8", errors="ignore") == expected_token:
                    return True
    except Exception:
        pass
    return False
