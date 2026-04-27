from __future__ import annotations
import json
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.redis_client import get_redis
from app.models.permission import Permission
from app.models.role import Role, RolePermission
from app.models.membership import OrgMembership, TenantMembership
from app.models.tenant_model import OrgTenant


async def get_user_permissions(
    db: AsyncSession,
    user_id: UUID,
    scope: str,
    scope_id: UUID,
) -> set[str]:
    cache_key = f"perms:{user_id}:{scope}:{scope_id}"
    redis = get_redis()
    cached = await redis.get(cache_key)
    if cached:
        return set(json.loads(cached))

    if scope == "tenant":
        stmt = (
            select(Permission.id)
            .distinct()
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .join(TenantMembership, TenantMembership.role_id == Role.id)
            .where(
                TenantMembership.user_id == user_id,
                TenantMembership.tenant_id == scope_id,
            )
        )
    else:
        stmt = (
            select(Permission.id)
            .distinct()
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .join(OrgMembership, OrgMembership.role_id == Role.id)
            .where(
                OrgMembership.user_id == user_id,
                OrgMembership.org_id == scope_id,
            )
        )

    result = await db.execute(stmt)
    perms: set[str] = {row[0] for row in result.fetchall() if row[0]}

    if await _is_org_owner(db, user_id, scope_id, scope):
        perms.add("*")

    await redis.setex(cache_key, 60, json.dumps(list(perms)))
    return perms


def has_permission(perms: set[str], permission: str) -> bool:
    return "*" in perms or permission in perms


async def invalidate_user_perms(user_id: UUID, org_id: UUID | None = None) -> None:
    """Invalidate all permission cache keys for a user (or a specific org)."""
    redis = get_redis()
    pattern = f"perms:{user_id}:*" if org_id is None else f"perms:{user_id}:*:{org_id}"
    keys = await redis.keys(pattern)
    if keys:
        await redis.delete(*keys)


async def invalidate_role_members_perms(db: AsyncSession, role_id: UUID) -> None:
    """Invalidate permission cache for every user assigned this role."""
    redis = get_redis()
    # Org-scoped role members
    result = await db.execute(
        select(OrgMembership.user_id, OrgMembership.org_id).where(
            OrgMembership.role_id == role_id
        )
    )
    for user_id, org_id in result.fetchall():
        key = f"perms:{user_id}:org:{org_id}"
        await redis.delete(key)

    # Tenant-scoped role members
    result = await db.execute(
        select(TenantMembership.user_id, TenantMembership.tenant_id).where(
            TenantMembership.role_id == role_id
        )
    )
    for user_id, tenant_id in result.fetchall():
        key = f"perms:{user_id}:tenant:{tenant_id}"
        await redis.delete(key)


async def _is_org_owner(
    db: AsyncSession, user_id: UUID, scope_id: UUID, scope: str
) -> bool:
    if scope == "tenant":
        tenant = await db.get(OrgTenant, scope_id)
        if not tenant:
            return False
        org_id = tenant.org_id
    else:
        org_id = scope_id

    result = await db.execute(
        select(OrgMembership.user_id)
        .join(Role, Role.id == OrgMembership.role_id)
        .where(
            OrgMembership.user_id == user_id,
            OrgMembership.org_id == org_id,
            Role.key == "org.owner",
        )
    )
    return result.scalar_one_or_none() is not None
