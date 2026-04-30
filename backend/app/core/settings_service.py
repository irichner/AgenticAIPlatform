"""Settings service — read platform settings from DB with env var fallback.

Priority order:
  1. DB value for the given org (or any org for pre-auth / background flows)
  2. Env var (key uppercased, using the canonical mapping below)
  3. Caller-supplied default

Use get_setting() when you have an org_id (request-scoped code, per-org agents).
Use get_setting_any_org() for background workers and pre-auth flows where no
specific org is in scope — works correctly on single-org deployments.
"""
from __future__ import annotations
import os
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_setting import PlatformSetting

# Maps setting key → env var name (for cases that differ from key.upper())
_ENV_MAP: dict[str, str] = {
    "anthropic_api_key":               "ANTHROPIC_API_KEY",
    "anthropic_model":                 "ANTHROPIC_MODEL",
    "openai_api_key":                  "OPENAI_API_KEY",
    "litellm_master_key":              "LITELLM_MASTER_KEY",
    "resend_api_key":                  "RESEND_API_KEY",
    "email_from":                      "EMAIL_FROM",
    "google_client_id":                "GOOGLE_CLIENT_ID",
    "google_client_secret":            "GOOGLE_CLIENT_SECRET",
    "google_redirect_uri":             "GOOGLE_REDIRECT_URI",
    "google_integration_redirect_uri": "GOOGLE_INTEGRATION_REDIRECT_URI",
    "langfuse_host":                   "LANGFUSE_HOST",
    "langfuse_public_key":             "LANGFUSE_PUBLIC_KEY",
    "langfuse_secret_key":             "LANGFUSE_SECRET_KEY",
    "retain_runs_days":                "RETAIN_RUNS_DAYS",
    "retain_signals_days":             "RETAIN_SIGNALS_DAYS",
    "retain_audit_log_days":           "RETAIN_AUDIT_LOG_DAYS",
    "retain_activities_days":          "RETAIN_ACTIVITIES_DAYS",
    "retain_orphan_activities_days":   "RETAIN_ORPHAN_ACTIVITIES_DAYS",
}


def _env_fallback(key: str, default: str | None) -> str | None:
    env_key = _ENV_MAP.get(key, key.upper())
    return os.getenv(env_key, default)


async def get_setting(
    db: AsyncSession,
    org_id: UUID,
    key: str,
    default: str | None = None,
) -> str | None:
    """Return the setting value for a specific org; fall back to env var, then default."""
    result = await db.execute(
        select(PlatformSetting).where(
            PlatformSetting.org_id == org_id,
            PlatformSetting.key == key,
        )
    )
    row = result.scalar_one_or_none()
    if row and row.value:
        return row.value
    return _env_fallback(key, default)


async def get_setting_any_org(
    db: AsyncSession,
    key: str,
    default: str | None = None,
) -> str | None:
    """Return the setting value from any org that has it configured; fall back to env var.

    Intended for background workers and pre-auth flows where org context is unavailable.
    Correct on single-org deployments; on multi-org deployments returns whichever org's
    value the DB returns first.
    """
    result = await db.execute(
        select(PlatformSetting).where(
            PlatformSetting.key == key,
            PlatformSetting.value.isnot(None),
        ).limit(1)
    )
    row = result.scalar_one_or_none()
    if row and row.value:
        return row.value
    return _env_fallback(key, default)
