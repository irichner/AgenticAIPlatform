"""Ask Lanara — streaming chat endpoint backed by the active AI model + MCP tools."""
from __future__ import annotations
import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm import get_active_llm, get_llm_by_id
from app.core.mcp_client import get_mcp_tools
from app.dependencies import get_db
from app.models.mcp_server import McpServer

router = APIRouter(prefix="/ask", tags=["ask"])
logger = logging.getLogger(__name__)


def _is_raw_tool_call(content: str) -> bool:
    """Return True when a model outputs a JSON tool-call as text instead of structured tool_calls."""
    text = content.strip()
    if not (text.startswith("{") and text.endswith("}")):
        return False
    try:
        obj = json.loads(text)
        return isinstance(obj, dict) and "name" in obj and ("parameters" in obj or "arguments" in obj)
    except Exception:
        return False

BASE_SYSTEM_PROMPT = (
    "You are Lanara, a general-purpose AI agent. "
    "You help users complete tasks by reasoning through problems and, when tools are "
    "available, using them to take action. Be concise and direct. If you are unsure, say so."
)

MAX_TOOL_ROUNDS = 10


class HistoryMessage(BaseModel):
    role: str
    content: str


class AskRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []
    model_id: str | None = None


@router.post("")
async def ask_lanara(payload: AskRequest, db: AsyncSession = Depends(get_db)):
    async def event_stream():
        try:
            llm = await get_llm_by_id(db, payload.model_id) if payload.model_id else await get_active_llm(db)
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"
            return

        result = await db.execute(
            select(McpServer).where(McpServer.enabled == True).order_by(McpServer.name)
        )
        servers = result.scalars().all()
        tools = await get_mcp_tools(servers)

        if tools:
            try:
                llm_bound = llm.bind_tools(tools)
            except Exception:
                # One or more tool schemas are invalid — filter them out individually
                valid: list = []
                for t in tools:
                    try:
                        llm.bind_tools([t])
                        valid.append(t)
                    except Exception:
                        logger.warning("Skipping tool '%s' — schema validation error", getattr(t, "name", "?"))
                tools = valid
                llm_bound = llm.bind_tools(tools) if tools else llm
        else:
            llm_bound = llm

        messages: list = [SystemMessage(content=BASE_SYSTEM_PROMPT)]
        for msg in payload.history[-20:]:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            else:
                messages.append(AIMessage(content=msg.content))
        messages.append(HumanMessage(content=payload.message))

        msgs = list(messages)
        bound = llm_bound
        try:
            for _ in range(MAX_TOOL_ROUNDS):
                try:
                    response = await bound.ainvoke(msgs)
                except Exception as exc:
                    if tools and "does not support tools" in str(exc):
                        bound = llm
                        response = await bound.ainvoke(msgs)
                    else:
                        raise
                msgs.append(response)

                if not getattr(response, "tool_calls", None):
                    content = response.content
                    # Small/local models sometimes output a raw JSON tool-call as text instead
                    # of using the structured tool_calls field — detect and retry without tools.
                    if isinstance(content, str) and _is_raw_tool_call(content) and bound is not llm:
                        logger.warning("Model returned raw tool-call JSON — retrying without tools")
                        response = await llm.ainvoke(msgs[:-1])
                        content = response.content
                    if isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                text = block.get("text", "")
                                if text:
                                    yield f"data: {json.dumps({'content': text})}\n\n"
                    elif isinstance(content, str) and content:
                        yield f"data: {json.dumps({'content': content})}\n\n"
                    break

                tool_map = {t.name: t for t in tools}
                for tc in response.tool_calls:
                    tool_name = tc["name"]
                    yield f"data: {json.dumps({'content': f'Running `{tool_name}`…\n\n'})}\n\n"
                    tool = tool_map.get(tc["name"])
                    if tool:
                        try:
                            tool_result = await tool.ainvoke(tc["args"])
                        except Exception as exc:
                            tool_result = f"Tool error: {exc}"
                    else:
                        tool_result = f"Unknown tool: {tc['name']}"
                    msgs.append(ToolMessage(
                        content=str(tool_result),
                        tool_call_id=tc["id"],
                    ))
        except Exception as exc:
            logger.exception("ask_lanara stream error")
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
