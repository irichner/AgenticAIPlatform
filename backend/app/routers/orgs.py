from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.dependencies import get_db
from app.auth.dependencies import current_user, require_permission
from app.auth.context import AuthContext
from app.auth.permissions import P
from app.auth.resolver import invalidate_user_perms
from app.auth.magic_link import create_magic_link
from app.auth.email import send_magic_link
from app.models.user import User
from app.models.org import Org
from app.models.membership import OrgMembership
from app.models.role import Role
from app.models.audit_log import AuditLog
from app.models.sso import OrgEmailDomain
from app.schemas.org import OrgCreate, OrgUpdate, OrgOut
from app.schemas.member import InviteRequest, MemberOut, MemberRoleUpdate, MemberLimitsUpdate
import os

router = APIRouter(prefix="/orgs", tags=["orgs"])
_APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:3000")

# ── Default swarm seed data ───────────────────────────────────────────────────
# 5 swarms × 3 sub-swarms × 3 agents = 45 system agents seeded per new org

_SEED_STRUCTURE = [
    {
        "name": "Sales",
        "sub_swarms": [
            {
                "name": "Salesforce",
                "agents": [
                    ("Pipeline Manager", "Monitors deal progression across the pipeline, flags stale opportunities, and surfaces accounts needing attention."),
                    ("Deal Coach", "Analyzes CRM data to surface deal risks and recommend next best actions to help reps close."),
                    ("Forecast Analyst", "Generates weekly and monthly revenue forecasts from pipeline data and highlights gaps to quota."),
                ],
            },
            {
                "name": "Gong",
                "agents": [
                    ("Call Analyzer", "Reviews recorded sales calls to extract key insights, objections, and competitor mentions."),
                    ("Revenue Intelligence Agent", "Synthesizes conversation data with CRM signals to surface revenue risks and deal momentum shifts."),
                    ("Coaching Manager", "Identifies coachable moments from calls and surfaces reps who need targeted guidance."),
                ],
            },
            {
                "name": "Outreach",
                "agents": [
                    ("Sequence Optimizer", "Analyzes email sequence performance and recommends subject line, timing, and content improvements."),
                    ("Prospect Engagement Monitor", "Tracks prospect engagement signals and surfaces hot leads for immediate rep follow-up."),
                    ("Meeting Booker", "Manages follow-up cadences and automates meeting scheduling from active sequences."),
                ],
            },
        ],
    },
    {
        "name": "Marketing",
        "sub_swarms": [
            {
                "name": "HubSpot",
                "agents": [
                    ("Lead Scoring Agent", "Evaluates inbound leads and assigns scores based on firmographic fit and behavioral engagement signals."),
                    ("Campaign Performance Monitor", "Tracks marketing campaign metrics and surfaces underperforming assets for review."),
                    ("Contact Lifecycle Manager", "Manages contact lifecycle stage transitions and triggers automated nurture workflows."),
                ],
            },
            {
                "name": "Marketo",
                "agents": [
                    ("Email Campaign Manager", "Builds and monitors email campaigns, optimizing for open rates, click-through, and conversion."),
                    ("Lead Nurture Specialist", "Designs and executes multi-touch nurture programs for leads at each stage of the funnel."),
                    ("Attribution Analyst", "Analyzes multi-touch attribution data to identify which channels and content drive pipeline."),
                ],
            },
            {
                "name": "Segment",
                "agents": [
                    ("Audience Builder", "Creates and manages behavioral audience segments for targeting across marketing channels."),
                    ("Data Quality Monitor", "Validates event tracking integrity and flags missing or malformed data entering the pipeline."),
                    ("Conversion Funnel Analyst", "Analyzes user journey data to identify funnel drop-off points and conversion opportunities."),
                ],
            },
        ],
    },
    {
        "name": "Finance",
        "sub_swarms": [
            {
                "name": "QuickBooks",
                "agents": [
                    ("Expense Reviewer", "Audits expense submissions for policy compliance and categorization accuracy."),
                    ("Cash Flow Monitor", "Tracks cash flow trends and alerts when account balances approach threshold limits."),
                    ("Reconciliation Agent", "Automates bank and account reconciliation and flags discrepancies for review."),
                ],
            },
            {
                "name": "NetSuite",
                "agents": [
                    ("Financial Close Manager", "Coordinates and tracks month-end close activities, flagging open items blocking completion."),
                    ("Budget Variance Analyst", "Compares actuals to budget and surfaces significant variances requiring explanation."),
                    ("AP/AR Monitor", "Monitors accounts payable and receivable aging reports and surfaces overdue items."),
                ],
            },
            {
                "name": "Stripe",
                "agents": [
                    ("Revenue Recognition Agent", "Tracks subscription revenue events and ensures proper recognition schedules are applied."),
                    ("Churn Risk Monitor", "Identifies failed payments and cancellation patterns to flag accounts at risk of churning."),
                    ("Billing Operations Specialist", "Manages subscription upgrades, downgrades, and proration events for accurate billing."),
                ],
            },
        ],
    },
    {
        "name": "Customer Success",
        "sub_swarms": [
            {
                "name": "Zendesk",
                "agents": [
                    ("Ticket Triage Agent", "Classifies and routes incoming support tickets by priority and product area to the right team."),
                    ("CSAT Monitor", "Tracks customer satisfaction scores and flags accounts showing declining satisfaction trends."),
                    ("Knowledge Base Manager", "Identifies support gaps from ticket patterns and recommends new help articles to create."),
                ],
            },
            {
                "name": "Intercom",
                "agents": [
                    ("Onboarding Specialist", "Guides new users through onboarding flows and flags accounts showing early drop-off signals."),
                    ("Proactive Outreach Agent", "Triggers targeted messages based on product usage signals and customer health score changes."),
                    ("NPS Analyst", "Analyzes net promoter score survey responses and categorizes feedback by theme and segment."),
                ],
            },
            {
                "name": "Gainsight",
                "agents": [
                    ("Health Score Monitor", "Tracks customer health scores and alerts CSMs when accounts trend toward risk status."),
                    ("QBR Prep Assistant", "Prepares quarterly business review materials by pulling usage, support, and adoption data."),
                    ("Renewal Risk Detector", "Identifies renewal risk signals and surfaces accounts needing immediate CSM attention."),
                ],
            },
        ],
    },
    {
        "name": "Operations",
        "sub_swarms": [
            {
                "name": "Slack",
                "agents": [
                    ("Alert Router", "Monitors operational alerts and routes critical notifications to the appropriate Slack channels."),
                    ("Status Update Bot", "Compiles and posts daily operational status summaries to relevant Slack channels."),
                    ("Incident Coordinator", "Coordinates incident response by tracking action items and keeping stakeholders updated."),
                ],
            },
            {
                "name": "Notion",
                "agents": [
                    ("Documentation Manager", "Identifies stale Notion pages and prompts owners to review and update documentation."),
                    ("Project Tracker", "Monitors project databases and surfaces at-risk deliverables and missed deadlines."),
                    ("Meeting Notes Compiler", "Extracts action items from meeting notes and tracks completion status across teams."),
                ],
            },
            {
                "name": "Asana",
                "agents": [
                    ("Task Prioritization Agent", "Reviews task queues and recommends prioritization based on deadlines and dependencies."),
                    ("Capacity Planner", "Analyzes team workload and surfaces capacity constraints before they become delivery blockers."),
                    ("Cross-team Dependencies Monitor", "Tracks cross-team task dependencies and flags blocking items needing resolution."),
                ],
            },
        ],
    },
]


async def _seed_org_defaults(db: AsyncSession, org_id: object) -> None:
    """Create the default 5 swarms, 3 sub-swarms each, and 3 system agents per sub-swarm."""
    from app.models.agent import Agent, AgentVersion
    from app.models.business_unit import BusinessUnit

    for swarm_def in _SEED_STRUCTURE:
        parent_bu = BusinessUnit(org_id=org_id, name=swarm_def["name"])
        db.add(parent_bu)
        await db.flush()

        for sub_def in swarm_def["sub_swarms"]:
            sub_bu = BusinessUnit(org_id=org_id, name=sub_def["name"], parent_id=parent_bu.id)
            db.add(sub_bu)
            await db.flush()

            for agent_name, agent_desc in sub_def["agents"]:
                agent = Agent(
                    business_unit_id=sub_bu.id,
                    name=agent_name,
                    description=agent_desc,
                    status="published",
                    is_system=True,
                )
                db.add(agent)
                await db.flush()
                db.add(AgentVersion(
                    agent_id=agent.id,
                    version_number=1,
                    prompt=agent_desc,
                    graph_definition=None,
                    tools=[],
                ))


# ── Org CRUD ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[OrgOut])
async def list_my_orgs(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OrgOut]:
    result = await db.execute(
        select(Org)
        .join(OrgMembership, OrgMembership.org_id == Org.id)
        .where(OrgMembership.user_id == user.id)
        .order_by(Org.name)
    )
    return result.scalars().all()


@router.post("", response_model=OrgOut, status_code=201)
async def create_org(
    body: OrgCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgOut:
    existing = await db.execute(select(Org).where(Org.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Slug '{body.slug}' already taken")

    _ORG_OWNER_ROLE_ID = UUID("00000000-0000-0000-0000-000000000001")
    _TN_ADMIN_ROLE_ID  = UUID("00000000-0000-0000-0000-000000000004")

    from app.models.tenant_model import OrgTenant
    from app.models.membership import TenantMembership
    import re

    org = Org(name=body.name, slug=body.slug, logo_url=body.logo_url)
    db.add(org)
    await db.flush()

    tenant_name = body.first_tenant_name or "Default"
    tenant_slug = re.sub(r"[^a-z0-9-]", "-", tenant_name.lower())[:63] or "default"
    tenant = OrgTenant(org_id=org.id, name=tenant_name, slug=tenant_slug)
    db.add(tenant)
    await db.flush()

    db.add(OrgMembership(org_id=org.id, user_id=user.id, role_id=_ORG_OWNER_ROLE_ID))
    db.add(TenantMembership(tenant_id=tenant.id, user_id=user.id, role_id=_TN_ADMIN_ROLE_ID))

    # Seed the owner's email domain so teammates auto-join on sign-in
    domain = user.email.lower().split("@")[-1]
    db.add(OrgEmailDomain(org_id=org.id, domain=domain))

    # Seed default swarms, sub-swarms, and system agents
    await _seed_org_defaults(db, org.id)

    await db.commit()
    await db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrgOut)
async def get_org(
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_READ, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> OrgOut:
    org = await db.get(Org, ctx.scope_id)
    if not org:
        raise HTTPException(404, "Org not found")
    return org


@router.patch("/{org_id}", response_model=OrgOut)
async def update_org(
    body: OrgUpdate,
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_WRITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> OrgOut:
    org = await db.get(Org, ctx.scope_id)
    if not org:
        raise HTTPException(404, "Org not found")

    rate_limits_changed = False
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
        if field in ("agent_runs_per_minute", "agent_runs_per_hour"):
            rate_limits_changed = True

    await db.commit()
    await db.refresh(org)

    if rate_limits_changed:
        from app.agents.rate_limit import invalidate_limits_cache
        await invalidate_limits_cache(org.id)

    await _audit(db, ctx, "org.update", "org", str(org.id))
    return org


# ── Member management ─────────────────────────────────────────────────────

@router.get("/{org_id}/members", response_model=list[MemberOut])
async def list_org_members(
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_READ, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> list[MemberOut]:
    result = await db.execute(
        select(OrgMembership, User, Role)
        .join(User, User.id == OrgMembership.user_id)
        .join(Role, Role.id == OrgMembership.role_id)
        .where(OrgMembership.org_id == ctx.scope_id)
        .order_by(User.email)
    )
    return [
        MemberOut(
            user_id=membership.user_id,
            email=user.email,
            full_name=user.full_name,
            avatar_url=getattr(user, "avatar_url", None),
            role_id=role.id,
            role_key=role.key,
            role_name=role.name,
            joined_at=membership.created_at,
        )
        for membership, user, role in result.fetchall()
    ]


@router.post("/{org_id}/members/invite", status_code=201)
async def invite_org_member(
    body: InviteRequest,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_INVITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Validate role belongs to this org (or is system)
    role = await db.get(Role, body.role_id)
    if not role or (role.org_id is not None and role.org_id != ctx.scope_id):
        raise HTTPException(400, "Invalid role for this org")

    token, _ = await create_magic_link(
        db, str(body.email), purpose="invite",
        org_id=ctx.scope_id, role_id=body.role_id,
        use_preflight=False,
    )
    link = f"{_APP_BASE_URL}/auth/verify?token={token}"
    await send_magic_link(str(body.email), link, purpose="invite", db=db)
    await _audit(db, ctx, "org.member.invite", "user", str(body.email))
    return {"detail": "Invitation sent"}


@router.patch("/{org_id}/members/{user_id}")
async def update_member_role(
    user_id: UUID,
    body: MemberRoleUpdate,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_INVITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    membership = await db.get(OrgMembership, (ctx.scope_id, user_id))
    if not membership:
        raise HTTPException(404, "Member not found")

    role = await db.get(Role, body.role_id)
    if not role or (role.org_id is not None and role.org_id != ctx.scope_id):
        raise HTTPException(400, "Invalid role for this org")

    old_role_id = membership.role_id
    membership.role_id = body.role_id
    await db.commit()

    # Invalidate cache for this user
    await invalidate_user_perms(user_id)
    await _audit(db, ctx, "org.member.role_change", "user", str(user_id),
                 {"old_role": str(old_role_id), "new_role": str(body.role_id)})
    return {"detail": "Role updated"}


@router.patch("/{org_id}/members/{user_id}/limits")
async def update_member_limits(
    user_id: UUID,
    body: MemberLimitsUpdate,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_INVITE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    membership = await db.get(OrgMembership, (ctx.scope_id, user_id))
    if not membership:
        raise HTTPException(404, "Member not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(membership, field, value)
    await db.commit()

    from app.agents.rate_limit import invalidate_limits_cache
    await invalidate_limits_cache(ctx.scope_id, user_id)
    await _audit(db, ctx, "org.member.limits_update", "user", str(user_id),
                 {"runs_per_minute": body.agent_runs_per_minute, "runs_per_hour": body.agent_runs_per_hour})
    return {"detail": "Limits updated"}


@router.delete("/{org_id}/members/{user_id}")
async def remove_org_member(
    user_id: UUID,
    ctx: AuthContext = Depends(require_permission(P.ORG_MEMBERS_REMOVE, scope="org")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Cannot remove the only owner
    result = await db.execute(
        select(func.count()).select_from(OrgMembership)
        .join(Role, Role.id == OrgMembership.role_id)
        .where(OrgMembership.org_id == ctx.scope_id, Role.key == "org.owner")
    )
    owner_count = result.scalar_one()

    membership = await db.get(OrgMembership, (ctx.scope_id, user_id))
    if not membership:
        raise HTTPException(404, "Member not found")

    role = await db.get(Role, membership.role_id)
    if role and role.key == "org.owner" and owner_count <= 1:
        raise HTTPException(400, "Cannot remove the only org owner")

    await db.delete(membership)
    await db.commit()
    await invalidate_user_perms(user_id)
    await _audit(db, ctx, "org.member.remove", "user", str(user_id))
    return {"detail": "Member removed"}


# ── Shared audit helper ────────────────────────────────────────────────────

async def _audit(
    db: AsyncSession,
    ctx: AuthContext,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    payload: dict | None = None,
) -> None:
    db.add(AuditLog(
        actor_user_id=ctx.user.id,
        org_id=ctx.org_id,
        tenant_id=ctx.tenant_id,
        permission=ctx.last_permission,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
        ip=ctx.ip,
        user_agent=ctx.user_agent,
    ))
    await db.commit()
