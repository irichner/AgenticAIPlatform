from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.dependencies import get_db
from app.models.business_unit import BusinessUnit
from app.schemas.business_unit import BusinessUnitCreate, BusinessUnitUpdate, BusinessUnitOut

router = APIRouter(prefix="/business-units", tags=["business-units"])


@router.get("", response_model=list[BusinessUnitOut])
async def list_business_units(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BusinessUnit).order_by(BusinessUnit.name))
    return result.scalars().all()


@router.post("", response_model=BusinessUnitOut, status_code=status.HTTP_201_CREATED)
async def create_business_unit(
    payload: BusinessUnitCreate,
    db: AsyncSession = Depends(get_db),
):
    bu = BusinessUnit(
        name=payload.name,
        description=payload.description,
        parent_id=payload.parent_id,
    )
    db.add(bu)
    await db.commit()
    await db.refresh(bu)
    return bu


@router.get("/{bu_id}", response_model=BusinessUnitOut)
async def get_business_unit(bu_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BusinessUnit).where(BusinessUnit.id == bu_id))
    bu = result.scalar_one_or_none()
    if bu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business unit not found")
    return bu


@router.patch("/{bu_id}", response_model=BusinessUnitOut)
async def update_business_unit(
    bu_id: UUID,
    payload: BusinessUnitUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BusinessUnit).where(BusinessUnit.id == bu_id))
    bu = result.scalar_one_or_none()
    if bu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business unit not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(bu, field, value)

    await db.commit()
    await db.refresh(bu)
    return bu


@router.delete("/{bu_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_business_unit(bu_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BusinessUnit).where(BusinessUnit.id == bu_id))
    bu = result.scalar_one_or_none()
    if bu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business unit not found")
    await db.delete(bu)
    await db.commit()
