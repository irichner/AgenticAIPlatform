from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.dependencies import get_db
from app.auth.dependencies import require_permission
from app.auth.context import AuthContext
from app.auth.permissions import P
from app.auth.resolver import invalidate_role_members_perms
from app.models.role import Role, RolePermission
from app.models.permission import Permission
from app.models.membership import OrgMembership
from app.models.audit_log import AuditLog
from app.schemas.role import RoleCreate, RoleUpdate, RoleOut, PermissionOut

router = APIRouter(prefix="/orgs", tags=["roles"])
_MAX_CUSTOM_ROLES = 50


@router.get("/{org_id}/permissions", response_model=list[PermissionOut])
async def list_permissions(
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_READ, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> list[PermissionOut]:
    result = await db.execute(
        select(Permission).order_by(Permission.scope, Permission.resource, Permission.id)
    )
    return result.scalars().all()


@router.get("/{org_id}/roles", response_model=list[RoleOut])
async def list_roles(
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_READ, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> list[RoleOut]:
    result = await db.execute(
        select(Role).where(
            (Role.org_id == ctx.scope_id) | Role.is_system
        ).order_by(Role.scope, Role.name)
    )
    roles = result.scalars().all()
    return [await _role_out(db, r) for r in roles]


@router.post("/{org_id}/roles", response_model=RoleOut, status_code=201)
async def create_role(
    body: RoleCreate,
    ctx: AuthContext = Depends(require_permission(P.ORG_ROLES_MANAGE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> RoleOut:
    if body.scope not in ("org", "tenant"):
        raise HTTPException(400, "scope must be 'org' or 'tenant'")

    # Enforce custom role cap
    count_result = await db.execute(
        select(func.count()).select_from(Role)
        .where(Role.org_id == ctx.scope_id, ~Role.is_system)
    )
    if count_result.scalar_one() >= _MAX_CUSTOM_ROLES:
        raise HTTPException(400, f"Custom role cap ({_MAX_CUSTOM_ROLES}) reached")

    # Validate permissions
    perm_ids = await _validate_permissions(db, body.scope, body.permission_ids)

    role = Role(
        org_id=ctx.scope_id,
        scope=body.scope,
        key=body.key,
        name=body.name,
        description=body.description,
        created_by=ctx.user.id,
    )
    db.add(role)
    await db.flush()

    for perm_id in perm_ids:
        db.add(RolePermission(role_id=role.id, permission_id=perm_id, granted_by=ctx.user.id))
    await db.commit()

    await _audit(db, ctx, "role.create", "role", str(role.id))
    return await _role_out(db, role)


@router.patch("/{org_id}/roles/{role_id}", response_model=RoleOut)
async def update_role(
    role_id: UUID,
    body: RoleUpdate,
    ctx: AuthContext = Depends(require_permission(P.ORG_ROLES_MANAGE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> RoleOut:
    role = await db.get(Role, role_id)
    if not role or (role.org_id is not None and role.org_id != ctx.scope_id):
        raise HTTPException(404, "Role not found")
    if role.is_system:
        raise HTTPException(403, "System roles are read-only")

    if body.name is not None:
        role.name = body.name
    if body.description is not None:
        role.description = body.description

    if body.permission_ids is not None:
        perm_ids = await _validate_permissions(db, role.scope, body.permission_ids)
        # Replace permission set
        result = await db.execute(
            select(RolePermission).where(RolePermission.role_id == role_id)
        )
        for rp in result.scalars().all():
            await db.delete(rp)
        for perm_id in perm_ids:
            db.add(RolePermission(
                role_id=role.id, permission_id=perm_id, granted_by=ctx.user.id
            ))

    await db.commit()
    await invalidate_role_members_perms(db, role_id)
    await _audit(db, ctx, "role.update", "role", str(role_id))
    return await _role_out(db, role)


@router.delete("/{org_id}/roles/{role_id}")
async def delete_role(
    role_id: UUID,
    ctx: AuthContext = Depends(require_permission(P.ORG_ROLES_MANAGE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    role = await db.get(Role, role_id)
    if not role or (role.org_id is not None and role.org_id != ctx.scope_id):
        raise HTTPException(404, "Role not found")
    if role.is_system:
        raise HTTPException(403, "Cannot delete system roles")

    # Block if any membership references this role
    count_result = await db.execute(
        select(func.count()).select_from(OrgMembership).where(OrgMembership.role_id == role_id)
    )
    if count_result.scalar_one() > 0:
        raise HTTPException(
            400,
            "Role is still assigned to members — reassign them first"
        )

    await db.delete(role)
    await db.commit()
    await _audit(db, ctx, "role.delete", "role", str(role_id))
    return {"detail": "Role deleted"}


# ── Helpers ───────────────────────────────────────────────────────────────

async def _validate_permissions(
    db: AsyncSession, scope: str, perm_ids: list[str]
) -> list[str]:
    if not perm_ids:
        return []
    result = await db.execute(
        select(Permission).where(Permission.id.in_(perm_ids))
    )
    perms = {p.id: p for p in result.scalars().all()}
    for pid in perm_ids:
        if pid not in perms:
            raise HTTPException(400, f"Unknown permission: {pid}")
        p = perms[pid]
        if p.system_only:
            raise HTTPException(400, f"Permission '{pid}' is system-only")
        if p.scope != scope:
            raise HTTPException(
                400, f"Permission '{pid}' is {p.scope}-scoped but role is {scope}-scoped"
            )
    return perm_ids


async def _role_out(db: AsyncSession, role: Role) -> RoleOut:
    result = await db.execute(
        select(RolePermission.permission_id).where(RolePermission.role_id == role.id)
    )
    perms = [row[0] for row in result.fetchall()]
    return RoleOut(
        id=role.id,
        org_id=role.org_id,
        scope=role.scope,
        key=role.key,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        is_default=role.is_default,
        created_at=role.created_at,
        permissions=perms,
    )


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
        permission=ctx.last_permission,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
        ip=ctx.ip,
        user_agent=ctx.user_agent,
    ))
    await db.commit()
