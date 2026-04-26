from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise LangGraph checkpointer (creates checkpoint tables if needed)
    from app.core.checkpointer import get_checkpointer
    app.state.checkpointer = await get_checkpointer()
    yield


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

from app.routers.health import router as health_router
from app.routers.business_units import router as business_units_router
from app.routers.agents import router as agents_router
from app.routers.groups import router as groups_router
from app.routers.runs import router as runs_router
from app.routers.documents import router as documents_router
from app.routers.approvals import router as approvals_router
from app.routers.mcp_servers import router as mcp_servers_router
from app.routers.ai_models import router as ai_models_router
from app.routers.chat import router as chat_router
from app.routers.ask import router as ask_router
from app.routers.config import router as config_router
from app.routers.integrations import router as integrations_router

app.include_router(health_router, prefix="/api")
app.include_router(business_units_router, prefix="/api")
app.include_router(agents_router, prefix="/api")
app.include_router(groups_router, prefix="/api")
app.include_router(runs_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(approvals_router, prefix="/api")
app.include_router(mcp_servers_router, prefix="/api")
app.include_router(ai_models_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(ask_router, prefix="/api")
app.include_router(config_router, prefix="/api")
app.include_router(integrations_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "Lanara API — Revenue Operations OS", "version": "0.2.0"}
