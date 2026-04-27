from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

_SYNC_INTERVAL_SECONDS = int(os.getenv("PROVIDER_SYNC_INTERVAL", str(86_400)))  # 24 h
_CATALOG_POLL_SECONDS  = int(os.getenv("CATALOG_SYNC_POLL",     str(3_600)))   # 1 h


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


async def _catalog_sync_loop():
    """Background task: poll enabled catalog sources on their individual intervals."""
    from app.db.engine import AsyncSessionLocal as db_session
    from app.services.catalog_sync import sync_all_sources
    await asyncio.sleep(90)  # stagger after provider sync
    while True:
        try:
            async with db_session() as db:
                await sync_all_sources(db)
        except Exception:
            pass
        await asyncio.sleep(_CATALOG_POLL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.core.checkpointer import get_checkpointer
    app.state.checkpointer = await get_checkpointer()
    task_provider = asyncio.create_task(_daily_provider_sync())
    task_catalog  = asyncio.create_task(_catalog_sync_loop())
    yield
    task_provider.cancel()
    task_catalog.cancel()
    for t in (task_provider, task_catalog):
        try:
            await t
        except asyncio.CancelledError:
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
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
from app.routers.catalog import admin_router as catalog_admin_router
from app.routers.catalog import catalog_router
from app.routers.auth import router as auth_router
from app.routers.orgs import router as orgs_router
from app.routers.tenants import router as tenants_router
from app.routers.roles import router as roles_router
from app.routers.audit import router as audit_router
from app.routers.sso import router as sso_router, auth_router as sso_auth_router

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
app.include_router(catalog_admin_router, prefix="/api")
app.include_router(catalog_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "Lanara API — Revenue Operations OS", "version": "0.2.0"}
