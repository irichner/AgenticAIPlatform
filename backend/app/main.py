from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

_SYNC_INTERVAL_SECONDS = int(os.getenv("PROVIDER_SYNC_INTERVAL", str(86_400)))  # 24 h

_IS_PRODUCTION = os.getenv("ENV", "development").lower() == "production"

def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    if _IS_PRODUCTION:
        return []
    return ["http://localhost:3000", "http://127.0.0.1:3000"]


async def _daily_provider_sync():
    """Background task: refresh API provider models once per day."""
    from app.db.engine import AsyncSessionLocal as db_session
    from app.services.provider_sync import sync_all_providers
    await asyncio.sleep(60)
    while True:
        try:
            async with db_session() as db:
                await sync_all_providers(db)
        except Exception:
            pass
        await asyncio.sleep(_SYNC_INTERVAL_SECONDS)


async def _ollama_warmup():
    """On startup, load all enabled local models into Ollama VRAM."""
    from app.db.engine import AsyncSessionLocal as db_session
    from app.models.ai_model import AiModel as AiModelTable
    from app.routers.ai_models import _ollama_set_keepalive
    from sqlalchemy import select as sa_select

    await asyncio.sleep(20)  # Let Ollama finish booting before sending requests

    try:
        async with db_session() as db:
            result = await db.execute(
                sa_select(AiModelTable).where(
                    AiModelTable.enabled == True,  # noqa: E712
                    AiModelTable.type == "local",
                )
            )
            models = result.scalars().all()

        for m in models:
            await _ollama_set_keepalive(
                m.model_id,
                m.base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
                -1,
            )
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.core.checkpointer import get_checkpointer
    from app.mcp_gateway.sweeper import run_sweeper_loop

    from app.agents.prebuilt.activity_logger import run_activity_logger_loop
    from app.agents.prebuilt.deal_health import run_deal_health_loop
    from app.agents.prebuilt.manager_briefing import run_manager_briefing_loop
    from app.agents.prebuilt.rep_coaching import run_coaching_loop
    from app.agents.prebuilt.gmail_poller import run_gmail_poller_loop
    from app.agents.prebuilt.signal_enricher import run_signal_enricher_loop
    from app.agents.scheduler import run_scheduler_loop
    from app.core.data_retention import run_data_retention_loop

    app.state.checkpointer = await get_checkpointer()
    task_provider = asyncio.create_task(_daily_provider_sync())
    task_warmup   = asyncio.create_task(_ollama_warmup())
    task_sweeper  = asyncio.create_task(run_sweeper_loop())
    task_activity_logger = asyncio.create_task(run_activity_logger_loop())
    task_deal_health = asyncio.create_task(run_deal_health_loop())
    task_briefing = asyncio.create_task(run_manager_briefing_loop())
    task_coaching = asyncio.create_task(run_coaching_loop())
    task_gmail   = asyncio.create_task(run_gmail_poller_loop())
    task_enricher = asyncio.create_task(run_signal_enricher_loop())
    task_scheduler = asyncio.create_task(run_scheduler_loop())
    task_retention = asyncio.create_task(run_data_retention_loop())
    yield
    _bg_tasks = (
        task_provider, task_warmup, task_sweeper, task_activity_logger,
        task_deal_health, task_briefing, task_coaching, task_gmail,
        task_enricher, task_scheduler, task_retention,
    )
    for t in _bg_tasks:
        t.cancel()
    try:
        await asyncio.wait_for(
            asyncio.gather(*_bg_tasks, return_exceptions=True),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        pass


app = FastAPI(
    title="Lanara API",
    description="Revenue Operations OS — SPM + CRM Agent Platform",
    version="0.2.0",
    redirect_slashes=False,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.middleware.auth import SessionAuthMiddleware
app.add_middleware(SessionAuthMiddleware)

from app.routers.health import router as health_router
from app.routers.business_units import router as business_units_router
from app.routers.agents import router as agents_router
from app.routers.groups import router as groups_router
from app.routers.runs import router as runs_router
from app.routers.documents import router as documents_router
from app.routers.approvals import router as approvals_router
from app.routers.mcp_servers import router as mcp_servers_router
from app.routers.mcp_dynamic import router as mcp_dynamic_router
from app.routers.ai_models import router as ai_models_router
from app.routers.api_providers import router as api_providers_router
from app.routers.chat import router as chat_router
from app.routers.ask import router as ask_router
from app.routers.config import router as config_router
from app.routers.integrations import router as integrations_router
from app.routers.workflows import router as workflows_router
from app.routers.workflow_runs import router as workflow_runs_router
from app.routers.auth import router as auth_router
from app.routers.orgs import router as orgs_router
from app.routers.tenants import router as tenants_router
from app.routers.roles import router as roles_router
from app.routers.audit import router as audit_router
from app.routers.sso import router as sso_router, auth_router as sso_auth_router
from app.mcp_gateway.router import router as mcp_gateway_router
from app.routers.accounts import router as accounts_router
from app.routers.contacts import router as contacts_router
from app.routers.opportunities import stages_router as opp_stages_router, opps_router as opps_router
from app.routers.activities import router as activities_router
from app.routers.signals import router as signals_router, integrations_router as integration_configs_router
from app.routers.deal_intelligence import signals_router as deal_signals_router, opp_intelligence_router
from app.routers.commission import router as commission_router, plans_router, quota_router
from app.routers.leaderboard import router as leaderboard_router
from app.routers.coaching import router as coaching_router
from app.routers.schedules import router as schedules_router
from app.routers.agent_db_policies import router as agent_db_policies_router
from app.routers.platform_settings import router as platform_settings_router

app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(sso_auth_router, prefix="/api")
app.include_router(orgs_router, prefix="/api")
app.include_router(tenants_router, prefix="/api")
app.include_router(roles_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(sso_router, prefix="/api")
app.include_router(business_units_router, prefix="/api")
app.include_router(agents_router, prefix="/api")
app.include_router(groups_router, prefix="/api")
app.include_router(runs_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(approvals_router, prefix="/api")
app.include_router(mcp_servers_router, prefix="/api")
app.include_router(mcp_dynamic_router, prefix="/api")
app.include_router(ai_models_router, prefix="/api")
app.include_router(api_providers_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(ask_router, prefix="/api")
app.include_router(config_router, prefix="/api")
app.include_router(integrations_router, prefix="/api")
app.include_router(workflows_router, prefix="/api")
app.include_router(workflow_runs_router, prefix="/api")
app.include_router(mcp_gateway_router, prefix="/api")
app.include_router(accounts_router, prefix="/api")
app.include_router(contacts_router, prefix="/api")
app.include_router(opp_stages_router, prefix="/api")
app.include_router(opps_router, prefix="/api")
app.include_router(activities_router, prefix="/api")
app.include_router(signals_router, prefix="/api")
app.include_router(integration_configs_router, prefix="/api")
app.include_router(deal_signals_router, prefix="/api")
app.include_router(opp_intelligence_router, prefix="/api")
app.include_router(commission_router, prefix="/api")
app.include_router(plans_router, prefix="/api")
app.include_router(quota_router, prefix="/api")
app.include_router(leaderboard_router, prefix="/api")
app.include_router(coaching_router, prefix="/api")
app.include_router(schedules_router, prefix="/api")
app.include_router(agent_db_policies_router, prefix="/api")
app.include_router(platform_settings_router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Lanara API — Revenue Operations OS", "version": "0.2.0"}

