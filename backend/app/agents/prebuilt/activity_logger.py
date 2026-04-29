"""Activity Logger Agent — processes signal_events and creates CRM activity records.

This agent runs as a background worker. For each pending signal_event it:
1. Parses the raw signal payload (email thread, meeting transcript, etc.)
2. Matches the signal to an account/contact/opportunity in the CRM
3. Creates an activity record via the CRM API (ai_summary left null for agents to fill)
4. Updates the signal_event status to processed
"""
from __future__ import annotations
import asyncio
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.engine import AsyncSessionLocal
from app.models.signals import Signal
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


async def _match_crm_entities(
    db: AsyncSession, org_id: uuid.UUID, payload: dict
) -> dict[str, uuid.UUID | None]:
    """Match (and auto-create) CRM records for signal participants."""
    result: dict[str, uuid.UUID | None] = {
        "account_id": None,
        "contact_id": None,
        "opportunity_id": None,
    }

    if payload.get("opportunity_id"):
        result["opportunity_id"] = uuid.UUID(payload["opportunity_id"])
    if payload.get("account_id"):
        result["account_id"] = uuid.UUID(payload["account_id"])

    raw_from = payload.get("from_email") or payload.get("email") or ""
    display_name, from_email = _parse_from_header(raw_from)
    if not from_email or "@" not in from_email:
        return result

    domain = from_email.split("@")[-1].lower()
    is_freemail = domain in _FREEMAIL_DOMAINS

    local_part = from_email.split("@")[0].lower()
    _NOREPLY_TOKENS = ("noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "bounce", "postmaster")
    if any(tok in local_part for tok in _NOREPLY_TOKENS):
        return result

    # ── Account ───────────────────────────────────────────────────────────────
    if not result["account_id"] and not is_freemail:
        acc_res = await db.execute(
            select(Account).where(Account.org_id == org_id, Account.domain == domain)
        )
        acc = acc_res.scalar_one_or_none()
        if acc:
            result["account_id"] = acc.id
        else:
            company_name = domain.split(".")[0].capitalize()
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

    # ── Contact ───────────────────────────────────────────────────────────────
    contact_res = await db.execute(
        select(Contact).where(Contact.org_id == org_id, Contact.email == from_email)
    )
    contact = contact_res.scalar_one_or_none()
    if contact:
        result["contact_id"] = contact.id
        if not result["account_id"] and contact.account_id:
            result["account_id"] = contact.account_id
    else:
        first, last = _name_parts(display_name, from_email)
        new_contact = Contact(
            org_id=org_id,
            account_id=result["account_id"],
            first_name=first or "Unknown",
            last_name=last,
            email=from_email,
        )
        db.add(new_contact)
        await db.flush()
        result["contact_id"] = new_contact.id
        print(f"[activity_logger] auto-created contact '{first} {last}' <{from_email}>")

    # ── Opportunity ───────────────────────────────────────────────────────────
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


async def _process_signal(db: AsyncSession, event: Signal) -> None:
    """Process a single pending signal event."""
    try:
        org_id = event.org_id
        payload = event.payload
        from app.db.rls import set_rls_org
        await set_rls_org(db, org_id)

        entities = await _match_crm_entities(db, org_id, payload)

        external_id = payload.get("thread_id") or payload.get("meeting_id") or payload.get("message_id")

        if external_id:
            existing = await db.execute(
                select(Activity).where(Activity.org_id == org_id, Activity.external_id == external_id)
            )
            if existing.scalar_one_or_none():
                await db.execute(
                    update(Signal)
                    .where(Signal.id == event.id)
                    .values(status="processed", processed_at=datetime.now(timezone.utc))
                )
                await db.commit()
                return

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
            ai_summary=None,   # left for a downstream agent to fill
            action_items=None,
            source=event.source,
            external_id=external_id,
        )
        db.add(activity)

        await db.execute(
            update(Signal)
            .where(Signal.id == event.id)
            .values(status="processed", processed_at=datetime.now(timezone.utc))
        )
        await db.commit()

    except Exception as e:
        await db.execute(
            update(Signal)
            .where(Signal.id == event.id)
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
                from app.db.rls import bypass_rls
                await bypass_rls(db)
                result = await db.execute(
                    select(Signal)
                    .where(Signal.status == "pending")
                    .order_by(Signal.created_at.asc())
                    .limit(_BATCH_SIZE)
                    .with_for_update(skip_locked=True)
                )
                events = result.scalars().all()

                for event in events:
                    await db.execute(
                        update(Signal)
                        .where(Signal.id == event.id)
                        .values(status="processing")
                    )
                    await db.commit()

            for event in events:
                try:
                    async with AsyncSessionLocal() as db:
                        from app.db.rls import set_rls_org
                        await set_rls_org(db, event.org_id)
                        result = await db.execute(select(Signal).where(Signal.id == event.id))
                        evt = result.scalar_one_or_none()
                        if evt and evt.status == "processing":
                            await _process_signal(db, evt)
                except Exception as e:
                    print(f"ActivityLogger: error processing signal {event.id}: {e}")

        except Exception as e:
            print(f"ActivityLogger: loop error: {e}")

        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
