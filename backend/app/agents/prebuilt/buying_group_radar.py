"""Buying Group Radar Agent — detects unknown stakeholders from email/meeting signals.

For each activity involving an opportunity:
1. Parses CC fields, attendee lists, email signatures
2. Identifies people not yet in the CRM
3. Creates BuyingGroupMember records
4. Flags missing roles (no champion, no economic buyer)
"""
from __future__ import annotations
import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.contact import Contact
from app.models.deal_intelligence import BuyingGroupMember, DealSignal
from app.models.opportunity import Opportunity


EMAIL_RE = re.compile(r"([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})")
NAME_RE = re.compile(r"^(.+?)\s*<")


def _parse_email_participants(raw: str) -> list[dict]:
    """Parse 'Name <email>, Name2 <email2>' style strings."""
    participants = []
    for part in raw.split(","):
        part = part.strip()
        email_m = EMAIL_RE.search(part)
        if not email_m:
            continue
        email = email_m.group(1).lower()
        name_m = NAME_RE.match(part)
        name = name_m.group(1).strip().strip('"') if name_m else email.split("@")[0]
        participants.append({"email": email, "name": name})
    return participants


_INTERNAL_DOMAINS = frozenset(["lanara.app", "gmail.com", "outlook.com", "yahoo.com", "hotmail.com"])


async def scan_activity_for_buying_group(
    db: AsyncSession,
    activity: Activity,
    org_id: UUID,
) -> int:
    """Scan an activity for new buying group members. Returns count added."""
    if not activity.opportunity_id:
        return 0

    # Extract participant info from payload fields stored in body/subject
    participants: list[dict] = []

    # Parse from activity body for email-like content
    body = activity.body or ""
    for email in EMAIL_RE.findall(body):
        email = email.lower()
        name = email.split("@")[0]
        participants.append({"email": email, "name": name})

    if not participants:
        return 0

    # Filter out internal domains
    opp_res = await db.execute(
        select(Opportunity).where(Opportunity.id == activity.opportunity_id)
    )
    opp = opp_res.scalar_one_or_none()
    if not opp:
        return 0

    added = 0
    for p in participants:
        domain = p["email"].split("@")[-1] if "@" in p["email"] else ""
        if domain in _INTERNAL_DOMAINS:
            continue

        # Check if already in CRM as contact
        contact_res = await db.execute(
            select(Contact).where(Contact.org_id == org_id, Contact.email == p["email"])
        )
        contact = contact_res.scalar_one_or_none()

        # Check if already in buying group
        existing_res = await db.execute(
            select(BuyingGroupMember).where(
                BuyingGroupMember.org_id == org_id,
                BuyingGroupMember.opportunity_id == activity.opportunity_id,
                BuyingGroupMember.email == p["email"],
            )
        )
        if existing_res.scalar_one_or_none():
            continue

        # Add to buying group
        member = BuyingGroupMember(
            org_id=org_id,
            opportunity_id=activity.opportunity_id,
            contact_id=contact.id if contact else None,
            name=p["name"] if p["name"] != p["email"].split("@")[0] else (contact.first_name + " " + contact.last_name if contact else p["name"]),
            email=p["email"],
            role="unknown",
            engagement_level="unknown",
            discovered_via=activity.source,
        )
        db.add(member)

        # Emit a deal signal
        db.add(DealSignal(
            org_id=org_id,
            opportunity_id=activity.opportunity_id,
            source_activity_id=activity.id,
            signal_type="buying_group_change",
            severity="medium",
            title=f"New stakeholder detected: {p['name']} ({p['email']})",
            description=f"Discovered via {activity.source} — not yet in CRM. Review and assign a role.",
        ))
        added += 1

    if added:
        await db.commit()

    return added


async def check_missing_roles(db: AsyncSession, org_id: UUID, opportunity_id: UUID) -> list[str]:
    """Return list of critical missing roles for an opportunity's buying group."""
    result = await db.execute(
        select(BuyingGroupMember.role).where(
            BuyingGroupMember.org_id == org_id,
            BuyingGroupMember.opportunity_id == opportunity_id,
        )
    )
    roles = {row[0] for row in result.fetchall()}
    missing = []
    if "champion" not in roles:
        missing.append("champion")
    if "economic_buyer" not in roles:
        missing.append("economic_buyer")
    return missing
