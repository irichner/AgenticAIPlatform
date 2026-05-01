"""Signal enricher — enriches Activity records with LLM-extracted intelligence.

Only runs for orgs that have at least one ENABLED local (Ollama/LM Studio/LocalAI)
or free-tier SaaS model (Groq) configured. Paid API models (Anthropic, OpenAI, etc.)
are never used here to avoid unexpected billing.

For each eligible email activity:
1. Sends subject + body to the org's free model with a structured extraction prompt
2. Writes per-activity intelligence (sentiment, urgency, buying signals, etc.)
3. Back-fills empty contact profile fields (phone, title, department, etc.)
4. Accumulates buying_signals / objections / competitor_mentions on the contact
"""
from __future__ import annotations
import asyncio
import json
import re
from datetime import datetime, timezone

from sqlalchemy import select, update, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.engine import AsyncSessionLocal
from app.models.activity import Activity
from app.models.contact import Contact
from app.models.ai_model import AiModel

_POLL_INTERVAL_SECONDS = 30
_BATCH_SIZE = 5

# Providers with a meaningful free tier — add more here as needed
_FREE_SAAS_PROVIDERS = frozenset({"groq"})


def _is_free_model_filter():
    """SQLAlchemy filter expression matching local or free-tier SaaS models."""
    return or_(
        AiModel.type == "local",
        func.lower(AiModel.provider).in_(_FREE_SAAS_PROVIDERS),
    )


async def _get_free_llm(db: AsyncSession, org_id):
    """Return a LangChain LLM only if the org has an enabled local/free model, else None."""
    result = await db.execute(
        select(AiModel)
        .options(selectinload(AiModel.provider_rel))
        .where(
            AiModel.enabled == True,  # noqa: E712
            AiModel.org_id == org_id,
            _is_free_model_filter(),
        )
        .order_by(AiModel.created_at)
        .limit(1)
    )
    model = result.scalar_one_or_none()
    if model is None:
        return None
    from app.agents.llm import build_llm
    provider_key = model.provider_rel.api_key if model.provider_rel else None
    return build_llm(model, provider_api_key=provider_key)


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

    llm = await _get_free_llm(db, org_id=activity.org_id)
    if llm is None:
        # No eligible model for this org — skip without marking enriched
        # so it will be picked up again once a model is enabled
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

            # Accumulate JSONB arrays (union, preserve insertion order)
            for field in ("buying_signals", "objections", "competitor_mentions"):
                new_items = data.get(field) or []
                if new_items:
                    existing = getattr(contact, field) or []
                    contact_vals[field] = list(dict.fromkeys(existing + new_items))

            if data.get("sentiment"):
                contact_vals["last_reply_sentiment"] = data["sentiment"]

            if contact_vals:
                await db.execute(
                    update(Contact).where(Contact.id == contact.id).values(**contact_vals)
                )

    await db.commit()


async def run_signal_enricher_loop() -> None:
    """Background loop: enrich pending email activities for orgs with free/local models."""
    print("[signal_enricher] starting — waiting 60s before first run")
    await asyncio.sleep(60)

    while True:
        try:
            async with AsyncSessionLocal() as db:
                from app.db.rls import bypass_rls
                await bypass_rls(db)

                # Subquery: org IDs that have at least one enabled local/free model
                eligible_orgs = (
                    select(AiModel.org_id)
                    .where(
                        AiModel.enabled == True,  # noqa: E712
                        _is_free_model_filter(),
                    )
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
