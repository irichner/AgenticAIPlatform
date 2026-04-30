from __future__ import annotations
import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.auth.dependencies import resolve_org
from app.models.api_provider import ApiProvider
from app.models.ai_model import AiModel
from app.schemas.api_provider import ApiProviderConnect, ApiProviderOut
from app.services.provider_sync import (
    connect_provider,
    sync_provider,
    ProviderAuthError,
    ProviderNetworkError,
    ProviderUnknownError,
)

router = APIRouter(prefix="/api-providers", tags=["api-providers"])


async def _with_count(db: AsyncSession, provider: ApiProvider) -> ApiProviderOut:
    result = await db.execute(
        select(func.count()).where(AiModel.provider_id == provider.id)
    )
    count = result.scalar_one()
    return ApiProviderOut.from_orm_mask(provider, model_count=count)


@router.get("", response_model=list[ApiProviderOut])
async def list_api_providers(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiProvider)
        .where(ApiProvider.org_id == org_id)
        .order_by(ApiProvider.display_name)
    )
    providers = result.scalars().all()
    return [await _with_count(db, p) for p in providers]


@router.post("", response_model=ApiProviderOut, status_code=status.HTTP_201_CREATED)
async def connect_api_provider(
    payload: ApiProviderConnect,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    try:
        provider = await asyncio.wait_for(
            connect_provider(db, payload, org_id=org_id),
            timeout=25.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Provider validation timed out — the server could not reach the provider API. Check outbound network access.",
        )
    except ProviderAuthError:
        # 400 not 401 — 401 triggers a frontend redirect-to-login
        raise HTTPException(status_code=400, detail="Invalid API key — check your credentials and try again")
    except ProviderNetworkError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except ProviderUnknownError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return await _with_count(db, provider)


@router.post("/{provider_id}/sync", response_model=ApiProviderOut)
async def sync_api_provider(
    provider_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiProvider).where(ApiProvider.id == provider_id, ApiProvider.org_id == org_id)
    )
    provider = result.scalar_one_or_none()
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    provider = await sync_provider(db, provider)
    return await _with_count(db, provider)


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_api_provider(
    provider_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiProvider).where(ApiProvider.id == provider_id, ApiProvider.org_id == org_id)
    )
    provider = result.scalar_one_or_none()
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.delete(provider)
    await db.commit()
