from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.dependencies import get_db
from app.auth.dependencies import resolve_org
from app.models.activity import Activity
from app.schemas.activity import ActivityCreate, ActivityUpdate, ActivityOut

router = APIRouter(prefix="/activities", tags=["crm-activities"])


@router.get("", response_model=list[ActivityOut])
async def list_activities(
    opportunity_id: UUID | None = Query(None),
    account_id: UUID | None = Query(None),
    contact_id: UUID | None = Query(None),
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    q = select(Activity).where(Activity.org_id == org_id)
    if opportunity_id:
        q = q.where(Activity.opportunity_id == opportunity_id)
    if account_id:
        q = q.where(Activity.account_id == account_id)
    if contact_id:
        q = q.where(Activity.contact_id == contact_id)
    result = await db.execute(q.order_by(Activity.occurred_at.desc()))
    return result.scalars().all()


@router.post("", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
async def create_activity(
    payload: ActivityCreate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    activity = Activity(org_id=org_id, **payload.model_dump())
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


@router.get("/{activity_id}", response_model=ActivityOut)
async def get_activity(
    activity_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Activity).where(Activity.id == activity_id, Activity.org_id == org_id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activity not found")
    return activity


@router.patch("/{activity_id}", response_model=ActivityOut)
async def update_activity(
    activity_id: UUID,
    payload: ActivityUpdate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Activity).where(Activity.id == activity_id, Activity.org_id == org_id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activity not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(activity, field, value)
    await db.commit()
    await db.refresh(activity)
    return activity


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Activity).where(Activity.id == activity_id, Activity.org_id == org_id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activity not found")
    await db.delete(activity)
    await db.commit()



@router.post("/cleanup-spam", status_code=status.HTTP_200_OK)
async def cleanup_spam_activities(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    """Delete spam/marketing activities and any contacts/accounts that only existed because of them."""
    from sqlalchemy import text as _text

    # Spam criteria: no contact linked (noreply sender) OR HTML artifacts in body (marketing email)
    spam_sql = """
        WITH spam AS (
            SELECT id, contact_id, account_id FROM activities
            WHERE org_id = :org_id
              AND source = 'gmail'
              AND (contact_id IS NULL OR body LIKE '%&#%' OR body LIKE '%%͏%%')
        ),
        orphaned_contacts AS (
            SELECT DISTINCT c.id FROM contacts c
            WHERE c.org_id = :org_id
              AND c.id IN (SELECT contact_id FROM spam WHERE contact_id IS NOT NULL)
              AND NOT EXISTS (
                  SELECT 1 FROM activities a
                  WHERE a.contact_id = c.id
                    AND NOT (a.source = 'gmail' AND (a.body LIKE '%&#%' OR a.body LIKE '%%͏%%'))
              )
              AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.account_id = c.account_id)
        ),
        orphaned_accounts AS (
            SELECT DISTINCT acc.id FROM accounts acc
            WHERE acc.org_id = :org_id
              AND NOT EXISTS (
                  SELECT 1 FROM contacts c WHERE c.account_id = acc.id
                  AND c.id NOT IN (SELECT id FROM orphaned_contacts)
              )
              AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.account_id = acc.id)
              AND EXISTS (SELECT 1 FROM contacts c WHERE c.account_id = acc.id)
        ),
        del_activities AS (
            DELETE FROM activities WHERE id IN (SELECT id FROM spam) RETURNING id
        ),
        del_contacts AS (
            DELETE FROM contacts WHERE id IN (SELECT id FROM orphaned_contacts) RETURNING id
        ),
        del_accounts AS (
            DELETE FROM accounts WHERE id IN (SELECT id FROM orphaned_accounts) RETURNING id
        )
        SELECT
            (SELECT COUNT(*) FROM del_activities) AS activities_deleted,
            (SELECT COUNT(*) FROM del_contacts)   AS contacts_deleted,
            (SELECT COUNT(*) FROM del_accounts)   AS accounts_deleted
    """

    result = await db.execute(_text(spam_sql), {"org_id": str(org_id)})
    row = result.fetchone()
    await db.commit()

    return {
        "activities_deleted": row.activities_deleted,
        "contacts_deleted": row.contacts_deleted,
        "accounts_deleted": row.accounts_deleted,
        "message": f"Deleted {row.activities_deleted} activities, {row.contacts_deleted} contacts, {row.accounts_deleted} accounts",
    }
