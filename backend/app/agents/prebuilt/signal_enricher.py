"""Signal enricher — enriches Activity records with LLM-extracted intelligence.

Uses the org's designated Default model (role = 'default_model'). If none is
configured, falls back to the first enabled chat-capable model. Skips the org
entirely if no model is available.

For each eligible email activity:
1. Sends subject + body to the LLM with a structured extraction prompt
2. Writes per-activity intelligence (sentiment, urgency, buying signals, etc.)
3. Back-fills empty contact profile fields (phone, title, department, etc.)
4. Accumulates buying_signals / objections / competitor_mentions on the contact
"""
from __future__ import annotations
import asyncio
import json
import re
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.engine import AsyncSessionLocal
from app.models.activity import Activity
from app.models.contact import Contact
from app.models.ai_model import AiModel

_POLL_INTERVAL_SECONDS = 30
_BATCH_SIZE = 5


async def _get_default_llm(db: AsyncSession, org_id):
    """Return a LangChain LLM for the org's Default model, falling back to any enabled model."""
    from app.agents.llm import get_llm_by_role, get_active_llm
    llm = await get_llm_by_role(db, org_id, "default_model")
    if llm is not None:
        return llm
    return await get_active_llm(db, org_id=org_id)


_PROMPT = """\
You are a B2B sales intelligence extractor. Analyze the email and extract structured data.

Subject: {subject}
Body:
{body}

Return a JSON object. Include only keys where you found clear evidence. Valid keys:
{{
  "sentiment": "positive" | "neutral" | "negative",
  "urgency": "high" | "medium" | "low",
  "buying_signals": ["..."],
  "objections": ["..."],
  "competitor_mentions": ["..."],
  "next_steps": "...",
  "contact_phone": "...",
  "contact_title": "...",
  "contact_department": "...",
  "contact_location": "...",
  "contact_linkedin": "...",
  "contact_timezone": "..."
}}

Return ONLY the JSON object."""


def _parse_json(text: str) -> dict:
    text = text.strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {}


async def _enrich(db: AsyncSession, activity: Activity) -> None:
    from app.db.rls import set_rls_org
    await set_rls_org(db, activity.org_id)

    body = (activity.body or "").strip()
    if not body:
        await db.execute(
            update(Activity).where(Activity.id == activity.id)
            .values(enriched_at=datetime.now(timezone.utc))
        )
        await db.commit()
        return

    llm = await _get_default_llm(db, org_id=activity.org_id)
    if llm is None:
        return

    data: dict = {}
    try:
        prompt = _PROMPT.format(subject=activity.subject or "", body=body[:4000])
        response = await llm.ainvoke(prompt)
        data = _parse_json(response.content)
    except Exception as e:
        print(f"[signal_enricher] LLM failed for activity {activity.id}: {e}")

    activity_vals: dict = {"enriched_at": datetime.now(timezone.utc)}
    if data.get("sentiment"):
        activity_vals["sentiment"] = data["sentiment"]
    if data.get("urgency"):
        activity_vals["urgency"] = data["urgency"]
    if data.get("buying_signals"):
        activity_vals["buying_signals"] = data["buying_signals"]
    if data.get("objections"):
        activity_vals["objections"] = data["objections"]
    if data.get("next_steps"):
        activity_vals["next_steps"] = data["next_steps"]

    await db.execute(
        update(Activity).where(Activity.id == activity.id).values(**activity_vals)
    )

    if activity.contact_id and data:
        contact_res = await db.execute(
            select(Contact).where(Contact.id == activity.contact_id)
        )
        contact = contact_res.scalar_one_or_none()
        if contact:
            contact_vals: dict = {}

            for db_field, data_key in [
                ("phone",        "contact_phone"),
                ("title",        "contact_title"),
                ("department",   "contact_department"),
                ("location",     "contact_location"),
                ("linkedin_url", "contact_linkedin"),
                ("timezone",     "contact_timezone"),
            ]:
                if data.get(data_key) and not getattr(contact, db_field):
                    contact_vals[db_field] = data[data_key]

            for field in ("buying_signals", "objections", "competitor_mentions"):
                raw = data.get(field)
                new_items = raw if isinstance(raw, list) else ([raw] if isinstance(raw, str) and raw else [])
                if new_items:
                    existing = getattr(contact, field) or []
                    contact_vals[field] = list(dict.fromkeys(existing + new_items))

            if data.get("sentiment"):
                contact_vals["last_reply_sentiment"] = data["sentiment"]

            if contact_vals:
                await db.execute(
                    update(Contact).where(Contact.id == contact.id).values(**contact_vals)
                )

            # Clear pending_enrichment once no more unenriched email activities remain
            remaining = await db.execute(
                select(Activity.id).where(
                    Activity.contact_id == activity.contact_id,
                    Activity.enriched_at.is_(None),
                    Activity.type == "email",
                ).limit(1)
            )
            if remaining.scalar_one_or_none() is None:
                await db.execute(
                    update(Contact)
                    .where(Contact.id == activity.contact_id)
                    .values(pending_enrichment=False)
                )

    await db.commit()


async def run_signal_enricher_loop() -> None:
    """Background loop: enrich pending email activities using the org's Default model."""
    print("[signal_enricher] starting — waiting 60s before first run")
    await asyncio.sleep(60)

    while True:
        try:
            async with AsyncSessionLocal() as db:
                from app.db.rls import bypass_rls
                await bypass_rls(db)

                # Orgs with at least one enabled model (any model — gating moved to _get_default_llm)
                eligible_orgs = (
                    select(AiModel.org_id)
                    .where(AiModel.enabled == True)  # noqa: E712
                    .scalar_subquery()
                )

                result = await db.execute(
                    select(Activity)
                    .where(
                        Activity.enriched_at.is_(None),
                        Activity.type == "email",
                        Activity.body.isnot(None),
                        Activity.org_id.in_(eligible_orgs),
                    )
                    .order_by(Activity.occurred_at.desc())
                    .limit(_BATCH_SIZE)
                    .with_for_update(skip_locked=True)
                )
                activities = result.scalars().all()

            for activity in activities:
                try:
                    async with AsyncSessionLocal() as db:
                        from app.db.rls import bypass_rls
                        await bypass_rls(db)
                        res = await db.execute(
                            select(Activity).where(Activity.id == activity.id)
                        )
                        act = res.scalar_one_or_none()
                        if act and act.enriched_at is None:
                            await _enrich(db, act)
                            print(f"[signal_enricher] enriched activity {act.id}")
                except Exception as e:
                    print(f"[signal_enricher] error on activity {activity.id}: {e}")

        except Exception as e:
            print(f"[signal_enricher] loop error: {e}")

        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
