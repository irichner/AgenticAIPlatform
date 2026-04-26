from fastapi import APIRouter
import os

router = APIRouter(prefix="/config", tags=["config"])


@router.get("")
async def get_config():
    return {
        "ollama_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    }
