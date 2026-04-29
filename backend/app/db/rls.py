"""RLS context helpers — set app.current_org_id / app.bypass_rls for a transaction.

Call one of these once at the start of any DB session that touches public CRM/SPM tables.
SET LOCAL is transaction-scoped: the value resets automatically on commit/rollback.
"""
from __future__ import annotations
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def set_rls_org(session: AsyncSession, org_id: uuid.UUID | str | None) -> None:
    """Restrict the current transaction to one org (normal user-facing path)."""
    val = str(org_id) if org_id else ""
    # set_config(name, value, is_local=true) is the parameterized equivalent of SET LOCAL.
    # asyncpg translates :oid → $1 which PostgreSQL rejects in SET LOCAL syntax.
    await session.execute(text("SELECT set_config('app.current_org_id', :oid, true)"), {"oid": val})


async def bypass_rls(session: AsyncSession) -> None:
    """Allow cross-org access for trusted internal background workers.

    Only use this for internal job-queue scans (e.g. activity_logger batch poll).
    Never expose this to user-facing code paths.
    """
    await session.execute(text("SELECT set_config('app.bypass_rls', 'internal', true)"))
