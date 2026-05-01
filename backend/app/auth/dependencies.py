from __future__ import annotations
from typing import Literal
from uuid import UUID
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.dependencies import get_db
from app.models.user import User
from app.models.membership import OrgMembership
from app.auth.context import AuthContext
from app.auth.resolver import get_user_permissions, has_permission


async def current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    user_id_str: str | None = request.scope.get("auth_user_id")
    if not user_id_str:
        raise HTTPException(401, "Not authenticated")
    user = await db.get(User, UUID(user_id_str))
    if not user:
        raise HTTPException(401, "Session user not found")
    return user


async def optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    user_id_str: str | None = request.scope.get("auth_user_id")
    if not user_id_str:
        return None
    return await db.get(User, UUID(user_id_str))


async def resolve_org(
    request: Request,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> UUID:
    """Read X-Org-Id header and validate the authenticated user is a member."""
    raw = request.headers.get("x-org-id")
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "X-Org-Id header is required")
    try:
        org_id = UUID(raw)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "X-Org-Id is not a valid UUID")
    result = await db.execute(
        select(OrgMembership).where(
            OrgMembership.org_id == org_id,
            OrgMembership.user_id == user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this org")
    return org_id


def require_org_permission(permission: str):
    """Like require_permission but reads org_id from X-Org-Id header (not path params).

    Use this for routes that scope by header rather than a /{org_id} path segment.
    Returns AuthContext. resolve_org already validates membership, this adds the
    per-permission gate on top.
    """
    async def dep(
        request: Request,
        user: User = Depends(current_user),
        org_id: UUID = Depends(resolve_org),
        db: AsyncSession = Depends(get_db),
    ) -> AuthContext:
        perms = await get_user_permissions(db, user.id, "org", org_id)
        if not has_permission(perms, permission):
            raise HTTPException(403, f"Missing permission: {permission}")
        return AuthContext(
            user=user,
            scope="org",
            scope_id=org_id,
            permissions=perms,
            last_permission=permission,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    return dep


def require_permission(permission: str, scope: Literal["org", "tenant"] = "org"):
    """FastAPI dependency factory.  Gates a route on a named permission."""

    async def dep(
        request: Request,
        user: User = Depends(current_user),
        db: AsyncSession = Depends(get_db),
    ) -> AuthContext:
        scope_id_str = request.path_params.get(f"{scope}_id")
        if not scope_id_str:
            raise HTTPException(400, f"Missing {scope}_id path parameter")

        scope_id = UUID(scope_id_str)
        perms = await get_user_permissions(db, user.id, scope, scope_id)
        if not has_permission(perms, permission):
            raise HTTPException(403, f"Missing permission: {permission}")

        ctx = AuthContext(
            user=user,
            scope=scope,
            scope_id=scope_id,
            permissions=perms,
            last_permission=permission,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        return ctx

    return dep
