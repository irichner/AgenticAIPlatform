from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db
from app.auth.dependencies import require_permission
from app.auth.context import AuthContext
from app.auth.permissions import P
from app.auth.resolver import invalidate_user_perms
from app.auth.magic_link import create_magic_link
from app.auth.email import send_magic_link
from app.models.user import User
from app.models.tenant_model import OrgTenant
from app.models.membership import TenantMembership
from app.models.role import Role
from app.models.audit_log import AuditLog
from app.schemas.tenant_schema import TenantCreate, TenantUpdate, TenantOut
from app.schemas.member import InviteRequest, MemberOut, MemberRoleUpdate
import os

router = APIRouter(prefix="/orgs", tags=["tenants"])
_APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:3000")


@router.get("/{org_id}/tenants", response_model=list[TenantOut])
async def list_tenants(
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_READ, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> list[TenantOut]:
    result = await db.execute(
        select(OrgTenant)
        .where(OrgTenant.org_id == ctx.scope_id)
        .order_by(OrgTenant.name)
    )
    return result.scalars().all()


@router.post("/{org_id}/tenants", response_model=TenantOut, status_code=201)
async def create_tenant(
    body: TenantCreate,
    ctx: AuthContext = Depends(require_permission(P.ORG_TENANTS_CREATE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> TenantOut:
    existing = await db.execute(
        select(OrgTenant).where(
            OrgTenant.org_id == ctx.scope_id, OrgTenant.slug == body.slug
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Slug '{body.slug}' already taken in this org")

    tenant = OrgTenant(org_id=ctx.scope_id, name=body.name, slug=body.slug)
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    await _audit(db, ctx, "tenant.create", "tenant", str(tenant.id))
    return tenant


@router.patch("/{org_id}/tenants/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: UUID,
    body: TenantUpdate,
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_WRITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> TenantOut:
    tenant = await db.get(OrgTenant, tenant_id)
    if not tenant or tenant.org_id != ctx.scope_id:
        raise HTTPException(404, "Tenant not found")
    if body.name is not None:
        tenant.name = body.name
    await db.commit()
    await db.refresh(tenant)
    await _audit(db, ctx, "tenant.update", "tenant", str(tenant_id))
    return tenant


@router.delete("/{org_id}/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: UUID,
    ctx: AuthContext = Depends(require_permission(P.ORG_TENANTS_DELETE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant = await db.get(OrgTenant, tenant_id)
    if not tenant or tenant.org_id != ctx.scope_id:
        raise HTTPException(404, "Tenant not found")
    await db.delete(tenant)
    await db.commit()
    await _audit(db, ctx, "tenant.delete", "tenant", str(tenant_id))
    return {"detail": "Tenant deleted"}


# ── Tenant member management ──────────────────────────────────────────────

@router.get("/{org_id}/tenants/{tenant_id}/members", response_model=list[MemberOut])
async def list_tenant_members(
    tenant_id: UUID,
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_READ, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> list[MemberOut]:
    result = await db.execute(
        select(TenantMembership, User, Role)
        .join(User, User.id == TenantMembership.user_id)
        .join(Role, Role.id == TenantMembership.role_id)
        .where(TenantMembership.tenant_id == tenant_id)
        .order_by(User.email)
    )
    return [
        MemberOut(
            user_id=m.user_id,
            email=user.email,
            full_name=user.full_name,
            avatar_url=getattr(user, "avatar_url", None),
            role_id=role.id,
            role_key=role.key,
            role_name=role.name,
            joined_at=m.created_at,
        )
        for m, user, role in result.fetchall()
    ]


@router.post("/{org_id}/tenants/{tenant_id}/members/invite", status_code=201)
async def invite_tenant_member(
    tenant_id: UUID,
    body: InviteRequest,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_INVITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant = await db.get(OrgTenant, tenant_id)
    if not tenant or tenant.org_id != ctx.scope_id:
        raise HTTPException(404, "Tenant not found")

    role = await db.get(Role, body.role_id)
    if not role or role.scope != "tenant":
        raise HTTPException(400, "Role must be tenant-scoped")

    token, _ = await create_magic_link(
        db, str(body.email), purpose="invite",
        org_id=ctx.scope_id, role_id=body.role_id,
        use_preflight=False,
    )
    link = f"{_APP_BASE_URL}/auth/verify?token={token}"
    await send_magic_link(str(body.email), link, purpose="invite", db=db)
    return {"detail": "Invitation sent"}


@router.patch("/{org_id}/tenants/{tenant_id}/members/{user_id}")
async def update_tenant_member_role(
    tenant_id: UUID,
    user_id: UUID,
    body: MemberRoleUpdate,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_INVITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    membership = await db.get(TenantMembership, (tenant_id, user_id))
    if not membership:
        raise HTTPException(404, "Member not found")

    role = await db.get(Role, body.role_id)
    if not role or role.scope != "tenant":
        raise HTTPException(400, "Role must be tenant-scoped")

    membership.role_id = body.role_id
    await db.commit()
    await invalidate_user_perms(user_id)
    return {"detail": "Role updated"}


@router.delete("/{org_id}/tenants/{tenant_id}/members/{user_id}")
async def remove_tenant_member(
    tenant_id: UUID,
    user_id: UUID,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_REMOVE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    membership = await db.get(TenantMembership, (tenant_id, user_id))
    if not membership:
        raise HTTPException(404, "Member not found")
    await db.delete(membership)
    await db.commit()
    await invalidate_user_perms(user_id)
    return {"detail": "Member removed"}


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
