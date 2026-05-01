"""Ask Lanara — streaming chat endpoint backed by the active AI model + MCP tools."""
from __future__ import annotations
import json
import logging
import os

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.agents.llm import get_active_llm, get_llm_by_id
from app.auth.dependencies import resolve_org
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


MAX_TOOL_ROUNDS = 10

_DEFAULT_APP_NAME = "Assistant"


def _build_system_prompt(app_name: str | None) -> str:
    name = (app_name or _DEFAULT_APP_NAME).strip() or _DEFAULT_APP_NAME
    return (
        f"You are {name}, a general-purpose AI agent. "
        f"Your name is {name}. Never refer to yourself by any other name. "
        "Do not mention the underlying model or technology that powers you. "
        "You help users complete tasks by reasoning through problems and, when tools are "
        "available, using them to take action. Be concise and direct. If you are unsure, say so."
    )


class HistoryMessage(BaseModel):
    role: str
    content: str


class AskRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []
    model_id: str | None = None
    app_name: str | None = None


def _yield_chunk(text: str) -> str:
    return f"data: {json.dumps({'content': text})}\n\n"


async def _stream_llm(bound, msgs):
    """Stream an LLM response, yielding (text_chunk, full_response) pairs.

    Normalises three reasoning formats into a single <think>…</think> stream:
    - Inline <think> tags in content string (DeepSeek-R1, Qwen QwQ, most Ollama reasoning models)
    - reasoning_content / thinking in additional_kwargs (OpenAI-compat providers that surface it)
    - {"type": "thinking"} content blocks (models that use structured content block APIs)
    """
    full = None
    in_reasoning = False  # tracks whether we're inside a reasoning_content block

    async for chunk in bound.astream(msgs):
        # Accumulate for tool call detection
        try:
            full = chunk if full is None else full + chunk
        except Exception:
            if full is None:
                full = chunk

        # Extract text content from the chunk
        content = chunk.content
        text = ""
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                block_type = block.get("type", "")
                if block_type == "thinking":
                    # Structured thinking block (used by some model APIs)
                    thinking_text = block.get("thinking", "")
                    if thinking_text:
                        if not in_reasoning:
                            yield "<think>", None
                            in_reasoning = True
                        yield thinking_text, None
                elif block_type == "text":
                    text += block.get("text", "")

        # Extract reasoning_content from additional_kwargs (xAI, DeepSeek API, some OpenAI-compat providers)
        extra = getattr(chunk, "additional_kwargs", {}) or {}
        reasoning = extra.get("reasoning_content") or extra.get("thinking") or ""
        if extra and not in_reasoning:
            logger.info("chunk additional_kwargs keys: %s | reasoning=%r", list(extra.keys()), bool(reasoning))

        if reasoning:
            if not in_reasoning:
                yield "<think>", None  # open tag once
                in_reasoning = True
            yield reasoning, None
        elif text:
            if in_reasoning:
                yield "</think>", None  # close tag once when answer begins
                in_reasoning = False
            yield text, None

    if in_reasoning:
        yield "</think>", None  # close unclosed block at end of stream

    yield "", full  # end-of-stream sentinel with assembled response


def _convert_tool_for_responses_api(tool) -> dict:
    """Convert a LangChain tool to xAI Responses API flat function format."""
    schema = getattr(tool, "args_schema", None)
    if schema is not None:
        try:
            params = schema.model_json_schema()
        except Exception:
            params = {"type": "object", "properties": {}}
    else:
        params = {"type": "object", "properties": {}}
    # Responses API uses flat format: {type, name, description, parameters}
    return {
        "type": "function",
        "name": tool.name,
        "description": getattr(tool, "description", ""),
        "parameters": params,
    }


async def _stream_xai_responses(llm, msgs: list, tools: list | None = None):
    """Stream from xAI's /v1/responses endpoint for multi-agent models.

    Handles the full tool-call loop using previous_response_id + function_call_output items.
    Yields (text_chunk, None) pairs. Reasoning deltas are wrapped in <think>…</think> tags.
    """
    api_key = os.getenv("XAI_API_KEY", "")
    if not api_key and hasattr(llm, "xai_api_key") and llm.xai_api_key:
        try:
            api_key = llm.xai_api_key.get_secret_value()
        except Exception:
            api_key = str(llm.xai_api_key)

    model_id = getattr(llm, "model", None) or getattr(llm, "model_name", "")
    tool_map = {t.name: t for t in (tools or [])}

    # Build initial input from LangChain messages
    input_items: list[dict] = []
    for msg in msgs:
        role = getattr(msg, "type", "")
        content = msg.content
        if isinstance(content, list):
            content = " ".join(
                b.get("text", "") for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            )
        if role == "system":
            input_items.append({"role": "system", "content": content})
        elif role == "human":
            input_items.append({"role": "user", "content": content})
        elif role == "ai":
            input_items.append({"role": "assistant", "content": content})

    # xAI multi-agent models manage their own tools internally;
    # passing client-side tools requires beta access and is not supported here.
    payload: dict = {"model": model_id, "input": input_items, "stream": True}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=90.0, write=10.0, pool=5.0)) as client:
        for _round in range(MAX_TOOL_ROUNDS):
            in_reasoning = False
            response_id: str | None = None
            # call_id → {"name": str, "args": str}
            pending_calls: dict[str, dict] = {}

            async with client.stream("POST", "https://api.x.ai/v1/responses", headers=headers, json=payload) as resp:
                if resp.status_code >= 400:
                    body = await resp.aread()
                    logger.error("xAI Responses API %d: %s", resp.status_code, body.decode())
                resp.raise_for_status()

                buf = ""
                async for raw in resp.aiter_bytes():
                    buf += raw.decode("utf-8", errors="replace")
                    while "\n" in buf:
                        line, buf = buf.split("\n", 1)
                        line = line.strip()
                        if not line or line.startswith(":") or not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            ev = json.loads(data)
                        except json.JSONDecodeError:
                            continue

                        ev_type = ev.get("type", "")
                        delta = ev.get("delta", "")

                        if ev_type == "response.created":
                            response_id = ev.get("response", {}).get("id")

                        elif ev_type == "response.output_text.delta" and delta:
                            if in_reasoning:
                                yield "</think>", None
                                in_reasoning = False
                            yield delta, None

                        elif ev_type in (
                            "response.reasoning_summary_text.delta",
                            "response.reasoning.delta",
                            "response.thinking.delta",
                        ) and delta:
                            if not in_reasoning:
                                yield "<think>", None
                                in_reasoning = True
                            yield delta, None

                        elif ev_type == "response.output_item.added":
                            item = ev.get("item", {})
                            if item.get("type") == "function_call":
                                call_id = item.get("call_id") or item.get("id", "")
                                pending_calls[call_id] = {"name": item.get("name", ""), "args": ""}

                        elif ev_type == "response.function_call_arguments.delta":
                            call_id = ev.get("call_id", "")
                            if call_id in pending_calls:
                                pending_calls[call_id]["args"] += delta

                        elif ev_type == "response.function_call_arguments.done":
                            call_id = ev.get("call_id", "")
                            if call_id in pending_calls:
                                pending_calls[call_id]["args"] = ev.get("arguments", pending_calls[call_id]["args"])

            if in_reasoning:
                yield "</think>", None

            if not pending_calls:
                break  # no tool calls → done

            # Execute tool calls and build next-round input
            tool_outputs: list[dict] = []
            for call_id, tc in pending_calls.items():
                tool_name = tc["name"]
                yield f"Running `{tool_name}`…\n\n", None
                try:
                    args = json.loads(tc["args"]) if tc["args"] else {}
                except Exception:
                    args = {}
                tool = tool_map.get(tool_name)
                if tool:
                    try:
                        result = await tool.ainvoke(args)
                    except Exception as exc:
                        result = f"Tool error: {exc}"
                else:
                    result = f"Unknown tool: {tool_name}"
                tool_outputs.append({"type": "function_call_output", "call_id": call_id, "output": str(result)})

            # Next round: reference the previous response and supply tool results
            payload = {
                "model": model_id,
                "previous_response_id": response_id,
                "input": tool_outputs,
                "stream": True,
            }

    yield "", None  # end-of-stream sentinel


@router.post("")
async def ask_lanara(
    payload: AskRequest,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    async def event_stream():
        try:
            llm = await get_llm_by_id(db, payload.model_id) if payload.model_id else await get_active_llm(db, org_id=org_id)
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # Determine if this is a local (Ollama) model for queue tracking
        _local_model_id: str | None = None
        try:
            from app.models.ai_model import AiModel as _AiModel
            if payload.model_id:
                _mr = await db.execute(select(_AiModel).where(_AiModel.id == payload.model_id))
            else:
                _mr = await db.execute(
                    select(_AiModel).where(_AiModel.enabled == True).order_by(_AiModel.created_at).limit(1)  # noqa: E712
                )
            _m = _mr.scalar_one_or_none()
            if _m and _m.type == "local":
                _local_model_id = _m.model_id
        except Exception:
            pass

        result = await db.execute(
            select(McpServer)
            .where(McpServer.enabled.is_(True), McpServer.org_id == org_id)
            .order_by(McpServer.name)
        )
        servers = result.scalars().all()
        tools = await get_mcp_tools(servers)

        if tools:
            try:
                llm_bound = llm.bind_tools(tools)
            except Exception:
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

        messages: list = [SystemMessage(content=_build_system_prompt(payload.app_name))]
        for msg in payload.history[-20:]:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            else:
                messages.append(AIMessage(content=msg.content))
        messages.append(HumanMessage(content=payload.message))

        msgs = list(messages)
        bound = llm_bound

        # Proactively route xAI multi-agent models — they don't support chat completions
        _model_name = (getattr(llm, "model", None) or getattr(llm, "model_name", "") or "").lower()
        _is_xai_multiagent = "multi-agent" in _model_name and hasattr(llm, "xai_api_key")
        if _is_xai_multiagent:
            try:
                async for text, _ in _stream_xai_responses(llm, msgs, tools=tools):
                    if text:
                        yield _yield_chunk(text)
            except Exception as exc:
                logger.exception("xAI Responses API error")
                yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"
            return

        if _local_model_id:
            from app.utils.ollama_tracking import incr_inflight as _incr
            await _incr(_local_model_id)

        try:
            for _ in range(MAX_TOOL_ROUNDS):
                full_response = None
                accumulated_text = ""

                try:
                    async for text, sentinel in _stream_llm(bound, msgs):
                        if sentinel is not None:
                            # End-of-stream sentinel — sentinel IS the full response
                            full_response = sentinel
                        elif text:
                            accumulated_text += text
                            yield _yield_chunk(text)
                except Exception as exc:
                    err_str = str(exc)
                    _tool_incompatible = (
                        "does not support tools" in err_str
                        or "Multi Agent requests are not allowed" in err_str
                        or "tool_choice" in err_str
                    )
                    if _tool_incompatible and bound is not llm:
                        # Model rejects tool-bound call — retry with bare LLM
                        bound = llm
                        full_response = None
                        accumulated_text = ""
                        try:
                            async for text, sentinel in _stream_llm(bound, msgs):
                                if sentinel is not None:
                                    full_response = sentinel
                                elif text:
                                    accumulated_text += text
                                    yield _yield_chunk(text)
                        except Exception as retry_exc:
                            raise retry_exc
                    elif _tool_incompatible and hasattr(llm, "xai_api_key"):
                        # xAI multi-agent model — retry via the Responses API
                        async for text, sentinel in _stream_xai_responses(llm, msgs, tools=tools):
                            if text:
                                accumulated_text += text
                                yield _yield_chunk(text)
                        # Responses API handles its own tool loop; exit our loop
                        full_response = None
                    elif _tool_incompatible:
                        raise ValueError(
                            "This model cannot be used via the chat completions endpoint. "
                            "Please select a standard chat model."
                        )
                    else:
                        raise

                if full_response is None:
                    break

                # Detect models that output raw JSON tool-calls as plain text
                if (
                    isinstance(accumulated_text, str)
                    and _is_raw_tool_call(accumulated_text)
                    and bound is not llm
                ):
                    logger.warning("Model returned raw tool-call JSON — retrying without tools")
                    bound = llm
                    full_response = None
                    accumulated_text = ""
                    async for text, sentinel in _stream_llm(bound, msgs):
                        if sentinel is not None:
                            full_response = sentinel
                        elif text:
                            accumulated_text += text
                            yield _yield_chunk(text)

                msgs.append(full_response)
                tool_calls = getattr(full_response, "tool_calls", None)

                if not tool_calls:
                    break

                tool_map = {t.name: t for t in tools}
                for tc in tool_calls:
                    tool_name = tc["name"]
                    yield _yield_chunk(f"Running `{tool_name}`…\n\n")
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
            if _local_model_id:
                from app.utils.ollama_tracking import decr_inflight as _decr
                await _decr(_local_model_id)
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
