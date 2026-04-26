from __future__ import annotations
from fastapi import Header, HTTPException, status

# Phase 2: role read from X-Role header (stub).
# Phase 3: replace with Auth0 JWT claim extraction — call signature stays identical.
VALID_ROLES = {"admin", "editor", "viewer", "member"}


def require_role(allowed: list[str]):
    """
    FastAPI dependency that enforces role-based access.
    Usage:  Depends(require_role(["admin", "editor"]))
    """
    async def _dep(x_role: str = Header(default="viewer")) -> str:
        role = x_role.lower() if x_role else "viewer"
        # "member" is treated as "viewer" for backward compat
        if role == "member":
            role = "viewer"
        if role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is not permitted. Required: {allowed}",
            )
        return role
    return _dep
