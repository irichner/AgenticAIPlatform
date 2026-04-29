from __future__ import annotations
import uuid
from typing import AsyncGenerator
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.engine import AsyncSessionLocal
from app.db.rls import set_rls_org


async def get_db(request: Request = None) -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        if request is not None:
            org_id_str = request.headers.get("x-org-id")
            if org_id_str:
                try:
                    uuid.UUID(org_id_str)
                    await set_rls_org(session, org_id_str)
                except ValueError:
                    pass
        yield session
