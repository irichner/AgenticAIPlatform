"""
ManifestSnapshot — pin tool list + schemas + credential hashes at run start.

Written once per run to mcp_run_snapshots. The call path reads the snapshot
from Postgres (not cache) to prevent post-pin tool substitution attacks.
"""
from __future__ import annotations

import uuid
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp_gateway.models import McpRunSnapshot, McpRegistration

logger = logging.getLogger(__name__)


async def create_snapshot(
    db: AsyncSession,
    run_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    registrations: list[McpRegistration],
    tools_by_reg: dict[str, list[dict[str, Any]]],
) -> McpRunSnapshot:
    snapshot_json: dict[str, Any] = {
        "registrations": [
            {
                "id": str(reg.id),
                "name": reg.name,
                "mcp_url": reg.mcp_url,
                "credential_hash": reg.credential_hash,
                "tools": tools_by_reg.get(str(reg.id), []),
            }
            for reg in registrations
        ]
    }
    snapshot = McpRunSnapshot(
        run_id=run_id,
        org_id=org_id,
        user_id=user_id,
        snapshot_json=snapshot_json,
    )
    db.add(snapshot)
    await db.commit()
    return snapshot


async def get_snapshot(db: AsyncSession, run_id: uuid.UUID) -> McpRunSnapshot | None:
    return await db.scalar(
        select(McpRunSnapshot).where(McpRunSnapshot.run_id == run_id)
    )


def get_allowed_tools_from_snapshot(
    snapshot: McpRunSnapshot,
    registration_id: uuid.UUID,
) -> list[str]:
    reg_id_str = str(registration_id)
    for entry in snapshot.snapshot_json.get("registrations", []):
        if entry.get("id") == reg_id_str:
            return [t["name"] for t in entry.get("tools", [])]
    return []


def assert_tool_in_snapshot(
    snapshot: McpRunSnapshot,
    registration_id: uuid.UUID,
    tool_name: str,
) -> None:
    allowed = get_allowed_tools_from_snapshot(snapshot, registration_id)
    if tool_name not in allowed:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tool '{tool_name}' was not in the run snapshot — cannot call post-pin",
        )
