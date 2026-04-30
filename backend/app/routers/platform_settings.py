from __future__ import annotations
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.auth.dependencies import require_permission
from app.auth.context import AuthContext
from app.auth.permissions import P
from app.models.platform_setting import PlatformSetting

router = APIRouter(prefix="/orgs", tags=["platform-settings"])

# ── Settings catalog ─────────────────────────────────────────────────────────
# Source of truth for every setting the UI can configure.
# The table stores only values; this catalog defines labels, groups, and secrecy.

CATALOG: list[dict] = [
    {
        "group": "ai_providers",
        "group_label": "AI Providers",
        "settings": [
            {"key": "anthropic_api_key",  "label": "Anthropic API Key",   "is_secret": True,  "description": "Primary LLM provider (Claude)"},
            {"key": "anthropic_model",    "label": "Default Model",        "is_secret": False, "description": "e.g. claude-sonnet-4-6"},
            {"key": "openai_api_key",     "label": "OpenAI API Key",       "is_secret": True,  "description": "For LiteLLM proxy or direct OpenAI use"},
            {"key": "litellm_master_key", "label": "LiteLLM Master Key",   "is_secret": True,  "description": "LiteLLM proxy master key"},
        ],
    },
    {
        "group": "email",
        "group_label": "Email",
        "settings": [
            {"key": "resend_api_key", "label": "Resend API Key",  "is_secret": True,  "description": "Transactional email via Resend"},
            {"key": "email_from",     "label": "From Address",    "is_secret": False, "description": "e.g. hello@yourdomain.com"},
        ],
    },
    {
        "group": "google_oauth",
        "group_label": "Google OAuth",
        "settings": [
            {"key": "google_client_id",                  "label": "Client ID",                  "is_secret": False, "description": "Google OAuth2 app client ID"},
            {"key": "google_client_secret",              "label": "Client Secret",              "is_secret": True,  "description": "Google OAuth2 app client secret"},
            {"key": "google_redirect_uri",               "label": "Auth Redirect URI",          "is_secret": False, "description": "e.g. https://yourdomain.com/api/auth/google/callback"},
            {"key": "google_integration_redirect_uri",   "label": "Integration Redirect URI",   "is_secret": False, "description": "e.g. https://yourdomain.com/api/integrations/google/callback"},
        ],
    },
    {
        "group": "observability",
        "group_label": "Observability",
        "settings": [
            {"key": "langfuse_host",       "label": "Langfuse Host",   "is_secret": False, "description": "e.g. https://cloud.langfuse.com"},
            {"key": "langfuse_public_key", "label": "Public Key",      "is_secret": False, "description": "Langfuse project public key"},
            {"key": "langfuse_secret_key", "label": "Secret Key",      "is_secret": True,  "description": "Langfuse project secret key"},
        ],
    },
    {
        "group": "data_retention",
        "group_label": "Data Retention",
        "settings": [
            {"key": "retain_runs_days",             "label": "Agent Runs (days)",        "is_secret": False, "description": "Days to keep agent run records"},
            {"key": "retain_signals_days",          "label": "Signals (days)",           "is_secret": False, "description": "Days to keep CRM signals"},
            {"key": "retain_audit_log_days",        "label": "Audit Log (days)",         "is_secret": False, "description": "Days to keep audit log entries"},
            {"key": "retain_activities_days",       "label": "Activities (days)",        "is_secret": False, "description": "Days to keep activity records"},
            {"key": "retain_orphan_activities_days","label": "Orphan Activities (days)", "is_secret": False, "description": "Days to keep orphan activity records"},
        ],
    },
]

_CATALOG_INDEX: dict[str, dict] = {
    s["key"]: s
    for group in CATALOG
    for s in group["settings"]
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class PlatformSettingOut(BaseModel):
    key: str
    label: str
    group: str
    group_label: str
    is_secret: bool
    is_set: bool
    value: str | None
    description: str


class PlatformSettingGroupOut(BaseModel):
    group: str
    group_label: str
    settings: list[PlatformSettingOut]


class PlatformSettingUpsert(BaseModel):
    key: str
    value: str


class BulkUpsertPayload(BaseModel):
    settings: list[PlatformSettingUpsert]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_response(
    group_meta: dict,
    stored: dict[str, PlatformSetting],
) -> PlatformSettingGroupOut:
    items = []
    for s in group_meta["settings"]:
        row = stored.get(s["key"])
        is_set = row is not None and row.value is not None and row.value != ""
        items.append(PlatformSettingOut(
            key=s["key"],
            label=s["label"],
            group=group_meta["group"],
            group_label=group_meta["group_label"],
            is_secret=s["is_secret"],
            is_set=is_set,
            # Never return the raw value for secrets — only non-secrets are passed back
            value=row.value if (row and not s["is_secret"]) else None,
            description=s["description"],
        ))
    return PlatformSettingGroupOut(
        group=group_meta["group"],
        group_label=group_meta["group_label"],
        settings=items,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/{org_id}/platform-settings", response_model=list[PlatformSettingGroupOut])
async def list_platform_settings(
    org_id: UUID,
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_READ)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PlatformSetting).where(PlatformSetting.org_id == org_id)
    )
    rows = result.scalars().all()
    stored = {r.key: r for r in rows}
    return [_build_response(group, stored) for group in CATALOG]


@router.put(
    "/{org_id}/platform-settings",
    response_model=list[PlatformSettingGroupOut],
    status_code=status.HTTP_200_OK,
)
async def upsert_platform_settings(
    org_id: UUID,
    payload: BulkUpsertPayload,
    ctx: AuthContext = Depends(require_permission(P.ORG_SETTINGS_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    for item in payload.settings:
        if item.key not in _CATALOG_INDEX:
            raise HTTPException(status_code=400, detail=f"Unknown setting key: {item.key}")

    result = await db.execute(
        select(PlatformSetting).where(PlatformSetting.org_id == org_id)
    )
    existing = {r.key: r for r in result.scalars().all()}

    for item in payload.settings:
        meta = _CATALOG_INDEX[item.key]
        if item.value == "":
            # Empty value → clear/delete the setting
            if item.key in existing:
                await db.delete(existing[item.key])
            continue

        if item.key in existing:
            existing[item.key].value = item.value
            existing[item.key].is_secret = meta["is_secret"]
            existing[item.key].updated_by = ctx.user.id
        else:
            row = PlatformSetting(
                org_id=org_id,
                key=item.key,
                value=item.value,
                is_secret=meta["is_secret"],
                updated_by=ctx.user.id,
            )
            db.add(row)

    await db.commit()

    result2 = await db.execute(
        select(PlatformSetting).where(PlatformSetting.org_id == org_id)
    )
    stored = {r.key: r for r in result2.scalars().all()}
    return [_build_response(group, stored) for group in CATALOG]
