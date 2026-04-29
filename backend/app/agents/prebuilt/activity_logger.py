"""Activity Logger Agent — processes signal_events and creates CRM activity records.

This agent runs as a background worker. For each pending signal_event it:
1. Parses the raw signal payload (email thread, meeting transcript, etc.)
2. Calls Claude to generate a concise AI summary and extract action items
3. Matches the signal to an account/contact/opportunity in the CRM
4. Creates an activity record via the CRM API
5. Updates the signal_event status to processed
"""
from __future__ import annotations
import asyncio
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.engine import AsyncSessionLocal
from app.models.signal_event import SignalEvent
from app.models.activity import Activity
from app.models.contact import Contact
from app.models.account import Account
from app.models.opportunity import Opportunity

_POLL_INTERVAL_SECONDS = 15
_BATCH_SIZE = 10

_FREEMAIL_DOMAINS = frozenset({
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk",
    "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "mac.com",
    "aol.com", "protonmail.com", "proton.me", "live.com",
})


def _parse_from_header(raw: str) -> tuple[str, str]:
    """'Display Name <email@domain.com>' → (display_name, bare_email)."""
    raw = raw.strip()
    if "<" in raw and ">" in raw:
        name = raw[:raw.index("<")].strip().strip('"').strip("'")
        email = raw[raw.index("<") + 1 : raw.index(">")].strip().lower()
        return name, email
    return "", raw.lower().strip()


def _name_parts(display: str, email: str) -> tuple[str, str]:
    """Return (first_name, last_name) from display name or email local part."""
    if display:
        parts = display.split(None, 1)
        return parts[0], parts[1] if len(parts) > 1 else ""
    local = email.split("@")[0]
    parts = re.split(r"[.\-_+]", local, 1)
    return parts[0].capitalize(), parts[1].capitalize() if len(parts) > 1 else ""


async def _get_comms_llm(db: AsyncSession, org_id):
    """Return (llm, model) for the Comms model, or (None, None) if not configured."""
    from app.agents.llm import get_llm_and_model_by_role
    result = await get_llm_and_model_by_role(db, org_id, "comms_model")
    if result is None:
        return None, None
    return result


async def _summarize_signal(llm, signal: SignalEvent, ai_model=None) -> dict[str, Any]:  # noqa: ANN001
    """Use Claude to extract summary and action items from a signal."""
    payload = signal.payload
    source = signal.source

    if source in ("gmail", "outlook") and signal.event_type == "email_received":
        content = f"""Email signal:
From: {payload.get('from_email', '')}
Subject: {payload.get('subject', '')}
Body: {(payload.get('body', ''))[:1500]}

Extract:
1. A 1-2 sentence summary of this email (what is the sender asking or saying?)
2. Up to 3 action items as a JSON array of strings
3. Detected sentiment: positive, neutral, or negative
4. Deal signals: any mentions of timeline, budget, competitors, objections, or next steps
5. Sender details from the email signature or context:
   - sender_name: full name (or null if unknown)
   - sender_title: job title (or null)
   - sender_company: company name (or null)
   - sender_phone: phone number from signature (or null)

Respond with JSON only: {{"summary": "...", "action_items": [...], "sentiment": "...", "deal_signals": [...], "sender_name": null, "sender_title": null, "sender_company": null, "sender_phone": null}}"""
    elif source in ("zoom", "teams", "meet"):
        content = f"""Meeting transcript signal:
Title: {payload.get('title', 'Meeting')}
Duration: {payload.get('duration_seconds', 0) // 60} minutes
Participants: {', '.join(payload.get('participants', []))}
Transcript excerpt: {(payload.get('transcript', ''))[:1500]}

Extract:
1. A 2-3 sentence summary
2. Up to 5 action items as a JSON array
3. Sentiment: positive, neutral, or negative
4. Deal signals

Respond with JSON only: {{"summary": "...", "action_items": [...], "sentiment": "...", "deal_signals": [...]}}"""
    else:
        return {"summary": f"Signal from {source}: {signal.event_type}", "action_items": [], "sentiment": "neutral", "deal_signals": []}

    try:
        from langchain_core.messages import HumanMessage
        if ai_model and ai_model.type == "local":
            from app.utils.ollama_tracking import track_ollama_call
            async with track_ollama_call(ai_model.model_id):
                response = await llm.ainvoke([HumanMessage(content=content)])
        else:
            response = await llm.ainvoke([HumanMessage(content=content)])
        text = response.content.strip()
        # Extract JSON from response
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        print(f"ActivityLogger: LLM summarization failed: {e}")

    return {"summary": "", "action_items": [], "sentiment": "neutral", "deal_signals": []}


async def _match_crm_entities(db: AsyncSession, org_id: uuid.UUID, payload: dict, extracted: dict | None = None) -> dict[str, uuid.UUID | None]:
    """Match (and auto-create) CRM records for signal participants."""
    result: dict[str, uuid.UUID | None] = {
        "account_id": None,
        "contact_id": None,
        "opportunity_id": None,
    }

    # Honour explicit IDs embedded in the payload
    if payload.get("opportunity_id"):
        result["opportunity_id"] = uuid.UUID(payload["opportunity_id"])
    if payload.get("account_id"):
        result["account_id"] = uuid.UUID(payload["account_id"])

    # Parse sender — handles "Name <email>" format
    raw_from = payload.get("from_email") or payload.get("email") or ""
    display_name, from_email = _parse_from_header(raw_from)
    if not from_email or "@" not in from_email:
        return result

    domain = from_email.split("@")[-1].lower()
    is_freemail = domain in _FREEMAIL_DOMAINS

    # Skip automated/noreply senders — they're not real contacts
    local_part = from_email.split("@")[0].lower()
    _NOREPLY_TOKENS = ("noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "bounce", "postmaster")
    if any(tok in local_part for tok in _NOREPLY_TOKENS):
        return result

    # ── 1. Look up or create Account (business domains only) ─────────────────
    if not result["account_id"] and not is_freemail:
        acc_res = await db.execute(
            select(Account).where(Account.org_id == org_id, Account.domain == domain)
        )
        acc = acc_res.scalar_one_or_none()
        if acc:
            result["account_id"] = acc.id
        else:
            ai_company = (extracted or {}).get("sender_company")
            company_name = ai_company or domain.split(".")[0].capitalize()
            new_acc = Account(
                org_id=org_id,
                name=company_name,
                domain=domain,
                website=f"https://{domain}",
            )
            db.add(new_acc)
            await db.flush()
            result["account_id"] = new_acc.id
            print(f"[activity_logger] auto-created account '{company_name}' ({domain})")

    # ── 2. Look up or create Contact ─────────────────────────────────────────
    contact_res = await db.execute(
        select(Contact).where(Contact.org_id == org_id, Contact.email == from_email)
    )
    contact = contact_res.scalar_one_or_none()
    if contact:
        result["contact_id"] = contact.id
        if not result["account_id"] and contact.account_id:
            result["account_id"] = contact.account_id
    else:
        ai = extracted or {}
        ai_name = ai.get("sender_name") or ""
        if ai_name:
            first, last = _name_parts(ai_name, from_email)
        else:
            first, last = _name_parts(display_name, from_email)
        new_contact = Contact(
            org_id=org_id,
            account_id=result["account_id"],
            first_name=first or "Unknown",
            last_name=last,
            email=from_email,
            title=ai.get("sender_title"),
            phone=ai.get("sender_phone"),
        )
        db.add(new_contact)
        await db.flush()
        result["contact_id"] = new_contact.id
        print(f"[activity_logger] auto-created contact '{first} {last}' <{from_email}>")

    # ── 3. Find open opportunity for this account ─────────────────────────────
    if result["account_id"] and not result["opportunity_id"]:
        opp_res = await db.execute(
            select(Opportunity).where(
                Opportunity.org_id == org_id,
                Opportunity.account_id == result["account_id"],
                Opportunity.won_at.is_(None),
                Opportunity.lost_at.is_(None),
            ).order_by(Opportunity.arr.desc().nulls_last()).limit(1)
        )
        opp = opp_res.scalar_one_or_none()
        if opp:
            result["opportunity_id"] = opp.id

    return result


def _activity_type_from_signal(source: str, event_type: str) -> str:
    if source in ("gmail", "outlook"):
        return "email"
    if source in ("zoom", "teams", "meet", "calendar"):
        return "meeting"
    if source == "slack":
        return "message"
    return "note"


async def _process_signal(db: AsyncSession, event: SignalEvent) -> None:
    """Process a single pending signal event."""
    try:
        org_id = event.org_id
        payload = event.payload

        # Use the org's designated Comms model — skip AI if none configured
        llm, comms_model = await _get_comms_llm(db, org_id)
        if llm is not None:
            extracted = await _summarize_signal(llm, event, comms_model)
        else:
            extracted = {"summary": "", "action_items": [], "sentiment": "neutral", "deal_signals": []}

        # Match CRM entities (auto-create contacts/accounts from AI-extracted details)
        entities = await _match_crm_entities(db, org_id, payload, extracted)

        # Determine external_id for dedup
        external_id = payload.get("thread_id") or payload.get("meeting_id") or payload.get("message_id")

        # Check if activity already exists for this external_id
        if external_id:
            existing = await db.execute(
                select(Activity).where(Activity.org_id == org_id, Activity.external_id == external_id)
            )
            if existing.scalar_one_or_none():
                # Already processed
                await db.execute(
                    update(SignalEvent)
                    .where(SignalEvent.id == event.id)
                    .values(status="processed", processed_at=datetime.now(timezone.utc))
                )
                await db.commit()
                return

        # Create CRM activity
        occurred_at_str = payload.get("occurred_at")
        occurred_at = datetime.fromisoformat(occurred_at_str) if occurred_at_str else datetime.now(timezone.utc)

        activity = Activity(
            org_id=org_id,
            opportunity_id=entities["opportunity_id"],
            account_id=entities["account_id"],
            contact_id=entities["contact_id"],
            type=_activity_type_from_signal(event.source, event.event_type),
            subject=payload.get("subject") or f"{event.source.title()} {event.event_type.replace('_', ' ')}",
            body=payload.get("body") or payload.get("transcript"),
            direction=payload.get("direction", "inbound"),
            occurred_at=occurred_at,
            duration_seconds=payload.get("duration_seconds"),
            ai_summary=extracted.get("summary"),
            action_items=extracted.get("action_items"),
            source=event.source,
            external_id=external_id,
        )
        db.add(activity)

        # Update signal status
        await db.execute(
            update(SignalEvent)
            .where(SignalEvent.id == event.id)
            .values(status="processed", processed_at=datetime.now(timezone.utc))
        )
        await db.commit()

    except Exception as e:
        await db.execute(
            update(SignalEvent)
            .where(SignalEvent.id == event.id)
            .values(status="failed", error=str(e)[:500])
        )
        await db.commit()
        raise


async def run_activity_logger_loop() -> None:
    """Background loop: poll signal_events and process pending ones."""
    print("ActivityLogger: starting signal processing loop")
    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(SignalEvent)
                    .where(SignalEvent.status == "pending")
                    .order_by(SignalEvent.created_at.asc())
                    .limit(_BATCH_SIZE)
                    .with_for_update(skip_locked=True)
                )
                events = result.scalars().all()

                for event in events:
                    # Mark as processing
                    await db.execute(
                        update(SignalEvent)
                        .where(SignalEvent.id == event.id)
                        .values(status="processing")
                    )
                    await db.commit()

            # Process outside the lock window — track queue depth per comms model
            if events:
                try:
                    from app.utils.ollama_tracking import set_queued as _sq, decr_queued as _dq
                    from app.models.ai_model import AiModel as _AM
                    async with AsyncSessionLocal() as _tdb:
                        _sample_org = events[0].org_id
                        _mr = await _tdb.execute(
                            select(_AM).where(_AM.org_id == _sample_org, _AM.role == "comms_model", _AM.enabled == True, _AM.type == "local")  # noqa: E712
                        )
                        _cm = _mr.scalar_one_or_none()
                        _track_model_id = _cm.model_id if _cm else None
                    if _track_model_id:
                        await _sq(_track_model_id, len(events))
                except Exception:
                    _track_model_id = None

            for event in events:
                try:
                    async with AsyncSessionLocal() as db:
                        # Re-fetch to get fresh state
                        result = await db.execute(select(SignalEvent).where(SignalEvent.id == event.id))
                        evt = result.scalar_one_or_none()
                        if evt and evt.status == "processing":
                            await _process_signal(db, evt)
                except Exception as e:
                    print(f"ActivityLogger: error processing signal {event.id}: {e}")
                finally:
                    if events and _track_model_id:
                        try:
                            from app.utils.ollama_tracking import decr_queued as _dq
                            await _dq(_track_model_id)
                        except Exception:
                            pass

        except Exception as e:
            print(f"ActivityLogger: loop error: {e}")

        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
