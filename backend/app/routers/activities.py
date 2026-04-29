from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
import asyncio
import json
import re

from app.dependencies import get_db
from app.auth.dependencies import resolve_org
from app.models.activity import Activity
from app.models.contact import Contact
from app.schemas.activity import ActivityCreate, ActivityUpdate, ActivityOut
from app.db.engine import AsyncSessionLocal

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


async def _get_gmail_access_token(org_id: UUID) -> str | None:
    """Return a valid Gmail access token for the org, refreshing if needed."""
    from app.models.google_token import GoogleOAuthToken
    from app.agents.prebuilt.gmail_poller import _get_valid_token
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(GoogleOAuthToken).where(
                GoogleOAuthToken.org_id == org_id,
                GoogleOAuthToken.refresh_token.isnot(None),
            )
        )
        row = res.scalar_one_or_none()
        if row is None:
            return None
        return await _get_valid_token(row, db)


async def _gmail_thread_date(access_token: str, thread_id: str) -> "datetime | None":
    """Fetch internalDate (ms epoch) for the last message in a Gmail thread."""
    import httpx
    from datetime import datetime, timezone
    try:
        async with httpx.AsyncClient(
            base_url="https://gmail.googleapis.com/gmail/v1",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        ) as client:
            resp = await client.get(
                f"/users/me/threads/{thread_id}",
                params={"format": "metadata", "metadataHeaders": ["Date"]},
            )
            if resp.status_code != 200:
                return None
            messages = resp.json().get("messages", [])
            if not messages:
                return None
            # internalDate is milliseconds since epoch (UTC)
            internal_ms = int(messages[-1].get("internalDate", 0))
            if internal_ms == 0:
                return None
            return datetime.fromtimestamp(internal_ms / 1000, tz=timezone.utc)
    except Exception:
        return None


async def _enrich_activities_bg(org_id: UUID) -> None:
    """Background task: run Comms model over activities missing ai_summary,
    and fix occurred_at for any activity where it was recorded as polling time."""
    from langchain_core.messages import HumanMessage
    from datetime import datetime, timezone
    from app.agents.llm import get_llm_and_model_by_role
    async with AsyncSessionLocal() as db:
        result = await get_llm_and_model_by_role(db, org_id, "comms_model")
        if result is None:
            print(f"[enrich] org={org_id} no Comms model — skipping")
            return
        llm, comms_model = result
        is_local = comms_model.type == "local"
        comms_model_id = comms_model.model_id

        # Fetch all Gmail/Outlook activities — those needing AI summary AND those needing date fix
        result = await db.execute(
            select(Activity).where(
                Activity.org_id == org_id,
                Activity.source.in_(["gmail", "outlook"]),
            ).order_by(Activity.occurred_at.desc())
        )
        all_activities = result.scalars().all()

    needs_summary_count = sum(1 for a in all_activities if a.ai_summary is None)
    print(f"[enrich] org={org_id} processing {len(all_activities)} activities, {needs_summary_count} need AI summary")
    if needs_summary_count and is_local:
        from app.utils.ollama_tracking import set_queued
        await set_queued(comms_model_id, needs_summary_count)

    # Get Gmail token once for date corrections
    access_token = await _get_gmail_access_token(org_id)

    # Semaphore limits concurrent Ollama calls to max_concurrent slots
    concurrency = max(1, comms_model.max_concurrent or 1)
    sem = asyncio.Semaphore(concurrency)

    async def _process_one(act) -> None:
        needs_summary = act.ai_summary is None
        needs_date_fix = (
            act.external_id
            and act.created_at
            and act.occurred_at
            and abs((act.occurred_at.replace(tzinfo=timezone.utc) if act.occurred_at.tzinfo is None else act.occurred_at)
                    .timestamp() -
                    (act.created_at.replace(tzinfo=timezone.utc) if act.created_at.tzinfo is None else act.created_at)
                    .timestamp()) < 300
        )

        if not needs_summary and not needs_date_fix:
            return

        extracted: dict = {}
        if needs_summary:
            content = f"""Email activity:
Subject: {act.subject or ''}
Body: {(act.body or '')[:1500]}

Extract:
1. A 1-2 sentence summary (what is the sender asking or saying?)
2. Up to 3 action items as a JSON array of strings
3. Sender details if present in the email body/signature:
   - sender_name: full name (or null)
   - sender_title: job title (or null)
   - sender_company: company name (or null)
   - sender_phone: phone number (or null)

Respond with JSON only: {{"summary": "...", "action_items": [...], "sender_name": null, "sender_title": null, "sender_company": null, "sender_phone": null}}"""

            async with sem:
                if is_local:
                    from app.utils.ollama_tracking import track_ollama_call, decr_queued
                    async with track_ollama_call(comms_model_id):
                        response = await llm.ainvoke([HumanMessage(content=content)])
                    await decr_queued(comms_model_id)
                else:
                    response = await llm.ainvoke([HumanMessage(content=content)])
            raw = response.content.strip()
            json_match = re.search(r'\{.*\}', raw, re.DOTALL)
            extracted = json.loads(json_match.group()) if json_match else {}

        real_date = None
        if needs_date_fix and access_token and act.external_id:
            real_date = await _gmail_thread_date(access_token, act.external_id)

        async with AsyncSessionLocal() as db:
            res = await db.execute(select(Activity).where(Activity.id == act.id))
            fresh = res.scalar_one_or_none()
            if fresh is None:
                return
            if needs_summary:
                fresh.ai_summary = extracted.get("summary") or ""
                fresh.action_items = extracted.get("action_items") or []
            if real_date:
                fresh.occurred_at = real_date
            if fresh.contact_id and any(extracted.get(k) for k in ("sender_title", "sender_phone")):
                contact_res = await db.execute(select(Contact).where(Contact.id == fresh.contact_id))
                contact = contact_res.scalar_one_or_none()
                if contact:
                    if not contact.title and extracted.get("sender_title"):
                        contact.title = extracted["sender_title"]
                    if not contact.phone and extracted.get("sender_phone"):
                        contact.phone = extracted["sender_phone"]
            await db.commit()

    tasks = [_process_one(act) for act in all_activities]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            print(f"[enrich] error on activity {all_activities[i].id}: {r}")

    print(f"[enrich] org={org_id} done (concurrency={concurrency})")


@router.post("/enrich", status_code=status.HTTP_202_ACCEPTED)
async def enrich_activities(
    background_tasks: BackgroundTasks,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    """Kick off background AI enrichment for activities missing ai_summary."""
    from app.agents.llm import get_llm_and_model_by_role
    if await get_llm_and_model_by_role(db, org_id, "comms_model") is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No Comms model configured — assign one in Admin → AI Models",
        )

    result = await db.execute(
        select(Activity.id).where(
            Activity.org_id == org_id,
            Activity.source.in_(["gmail", "outlook"]),
        )
    )
    pending_count = len(result.scalars().all())
    if pending_count == 0:
        return {"queued": 0, "message": "No Gmail/Outlook activities to process"}

    background_tasks.add_task(_enrich_activities_bg, org_id)
    return {"queued": pending_count, "message": f"Processing {pending_count} activities (summaries + date corrections) in the background"}


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
