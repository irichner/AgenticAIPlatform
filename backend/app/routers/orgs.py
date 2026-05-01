from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.dependencies import get_db
from app.auth.dependencies import current_user, require_permission
from app.auth.context import AuthContext
from app.auth.permissions import P
from app.auth.resolver import invalidate_user_perms
from app.auth.magic_link import create_magic_link
from app.auth.email import send_magic_link
from app.models.user import User
from app.models.org import Org
from app.models.membership import OrgMembership
from app.models.role import Role
from app.models.audit_log import AuditLog
from app.schemas.org import OrgCreate, OrgUpdate, OrgOut
from app.schemas.member import InviteRequest, MemberOut, MemberRoleUpdate, MemberLimitsUpdate
import os

router = APIRouter(prefix="/orgs", tags=["orgs"])
_APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:3000")


# ── Org CRUD ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[OrgOut])
async def list_my_orgs(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OrgOut]:
    result = await db.execute(
        select(Org)
        .join(OrgMembership, OrgMembership.org_id == Org.id)
        .where(OrgMembership.user_id == user.id)
        .order_by(Org.name)
    )
    return result.scalars().all()


@router.post("", response_model=OrgOut, status_code=201)
async def create_org(
    body: OrgCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgOut:
    existing = await db.execute(select(Org).where(Org.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Slug '{body.slug}' already taken")

    _ORG_OWNER_ROLE_ID = UUID("00000000-0000-0000-0000-000000000001")
    _TN_ADMIN_ROLE_ID  = UUID("00000000-0000-0000-0000-000000000004")

    from app.models.tenant_model import OrgTenant
    from app.models.membership import TenantMembership
    import re

    org = Org(name=body.name, slug=body.slug, logo_url=body.logo_url)
    db.add(org)
    await db.flush()

    tenant_name = body.first_tenant_name or "Default"
    tenant_slug = re.sub(r"[^a-z0-9-]", "-", tenant_name.lower())[:63] or "default"
    tenant = OrgTenant(org_id=org.id, name=tenant_name, slug=tenant_slug)
    db.add(tenant)
    await db.flush()

    db.add(OrgMembership(org_id=org.id, user_id=user.id, role_id=_ORG_OWNER_ROLE_ID))
    db.add(TenantMembership(tenant_id=tenant.id, user_id=user.id, role_id=_TN_ADMIN_ROLE_ID))
    await db.commit()
    await db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrgOut)
async def get_org(
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_READ, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> OrgOut:
    org = await db.get(Org, ctx.scope_id)
    if not org:
        raise HTTPException(404, "Org not found")
    return org


@router.patch("/{org_id}", response_model=OrgOut)
async def update_org(
    body: OrgUpdate,
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_WRITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> OrgOut:
    org = await db.get(Org, ctx.scope_id)
    if not org:
        raise HTTPException(404, "Org not found")

    rate_limits_changed = False
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
        if field in ("agent_runs_per_minute", "agent_runs_per_hour"):
            rate_limits_changed = True

    await db.commit()
    await db.refresh(org)

    if rate_limits_changed:
        from app.agents.rate_limit import invalidate_limits_cache
        await invalidate_limits_cache(org.id)

    await _audit(db, ctx, "org.update", "org", str(org.id))
    return org


# ── Member management ─────────────────────────────────────────────────────

@router.get("/{org_id}/members", response_model=list[MemberOut])
async def list_org_members(
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_READ, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> list[MemberOut]:
    result = await db.execute(
        select(OrgMembership, User, Role)
        .join(User, User.id == OrgMembership.user_id)
        .join(Role, Role.id == OrgMembership.role_id)
        .where(OrgMembership.org_id == ctx.scope_id)
        .order_by(User.email)
    )
    return [
        MemberOut(
            user_id=membership.user_id,
            email=user.email,
            full_name=user.full_name,
            avatar_url=getattr(user, "avatar_url", None),
            role_id=role.id,
            role_key=role.key,
            role_name=role.name,
            joined_at=membership.created_at,
        )
        for membership, user, role in result.fetchall()
    ]


@router.post("/{org_id}/members/invite", status_code=201)
async def invite_org_member(
    body: InviteRequest,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_INVITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Validate role belongs to this org (or is system)
    role = await db.get(Role, body.role_id)
    if not role or (role.org_id is not None and role.org_id != ctx.scope_id):
        raise HTTPException(400, "Invalid role for this org")

    token, _ = await create_magic_link(
        db, str(body.email), purpose="invite",
        org_id=ctx.scope_id, role_id=body.role_id,
        use_preflight=False,
    )
    link = f"{_APP_BASE_URL}/auth/verify?token={token}"
    await send_magic_link(str(body.email), link, purpose="invite", db=db)
    await _audit(db, ctx, "org.member.invite", "user", str(body.email))
    return {"detail": "Invitation sent"}


@router.patch("/{org_id}/members/{user_id}")
async def update_member_role(
    user_id: UUID,
    body: MemberRoleUpdate,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_INVITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    membership = await db.get(OrgMembership, (ctx.scope_id, user_id))
    if not membership:
        raise HTTPException(404, "Member not found")

    role = await db.get(Role, body.role_id)
    if not role or (role.org_id is not None and role.org_id != ctx.scope_id):
        raise HTTPException(400, "Invalid role for this org")

    old_role_id = membership.role_id
    membership.role_id = body.role_id
    await db.commit()

    # Invalidate cache for this user
    await invalidate_user_perms(user_id)
    await _audit(db, ctx, "org.member.role_change", "user", str(user_id),
                 {"old_role": str(old_role_id), "new_role": str(body.role_id)})
    return {"detail": "Role updated"}


@router.patch("/{org_id}/members/{user_id}/limits")
async def update_member_limits(
    user_id: UUID,
    body: MemberLimitsUpdate,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_INVITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    membership = await db.get(OrgMembership, (ctx.scope_id, user_id))
    if not membership:
        raise HTTPException(404, "Member not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(membership, field, value)
    await db.commit()

    from app.agents.rate_limit import invalidate_limits_cache
    await invalidate_limits_cache(ctx.scope_id, user_id)
    await _audit(db, ctx, "org.member.limits_update", "user", str(user_id),
                 {"runs_per_minute": body.agent_runs_per_minute, "runs_per_hour": body.agent_runs_per_hour})
    return {"detail": "Limits updated"}


@router.delete("/{org_id}/members/{user_id}")
async def remove_org_member(
    user_id: UUID,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_REMOVE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Cannot remove the only owner
    result = await db.execute(
        select(func.count()).select_from(OrgMembership)
        .join(Role, Role.id == OrgMembership.role_id)
        .where(OrgMembership.org_id == ctx.scope_id, Role.key == "org.owner")
    )
    owner_count = result.scalar_one()

    membership = await db.get(OrgMembership, (ctx.scope_id, user_id))
    if not membership:
        raise HTTPException(404, "Member not found")

    role = await db.get(Role, membership.role_id)
    if role and role.key == "org.owner" and owner_count <= 1:
        raise HTTPException(400, "Cannot remove the only org owner")

    await db.delete(membership)
    await db.commit()
    await invalidate_user_perms(user_id)
    await _audit(db, ctx, "org.member.remove", "user", str(user_id))
    return {"detail": "Member removed"}


# ── Shared audit helper ────────────────────────────────────────────────────

async def _audit(
    db: AsyncSession,
    ctx: AuthContext,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    payload: dict | None = None,
) -> None:
    db.add(AuditLog(
        actor_user_id=ctx.user.id,
        org_id=ctx.org_id,
        tenant_id=ctx.tenant_id,
        permission=ctx.last_permission,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
        ip=ctx.ip,
        user_agent=ctx.user_agent,
    ))
    await db.commit()
