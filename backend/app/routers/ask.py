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

from app.agents.llm import get_active_llm
from app.core.mcp_client import get_mcp_tools
from app.dependencies import get_db
from app.models.mcp_server import McpServer

router = APIRouter(prefix="/ask", tags=["ask"])
logger = logging.getLogger(__name__)

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


@router.post("")
async def ask_lanara(payload: AskRequest, db: AsyncSession = Depends(get_db)):
    llm = await get_active_llm(db)

    result = await db.execute(
        select(McpServer).where(McpServer.enabled == True).order_by(McpServer.name)
    )
    servers = result.scalars().all()
    tools = await get_mcp_tools(servers)

    llm_bound = llm.bind_tools(tools) if tools else llm

    messages: list = [SystemMessage(content=BASE_SYSTEM_PROMPT)]
    for msg in payload.history[-20:]:
        if msg.role == "user":
            messages.append(HumanMessage(content=msg.content))
        else:
            messages.append(AIMessage(content=msg.content))
    messages.append(HumanMessage(content=payload.message))

    async def event_stream():
        msgs = list(messages)
        try:
            for _ in range(MAX_TOOL_ROUNDS):
                response = await llm_bound.ainvoke(msgs)
                msgs.append(response)

                if not getattr(response, "tool_calls", None):
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
