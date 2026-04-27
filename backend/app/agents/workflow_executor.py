"""Dynamic BPMN workflow executor — streams execution events as JSON strings."""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Any, AsyncGenerator

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.agents.llm import get_active_llm, get_llm_by_id
from app.core.mcp_client import get_mcp_tools
from app.models.agent import Agent, AgentVersion
from app.models.mcp_server import McpServer

logger = logging.getLogger(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _ev(type_: str, **kwargs) -> str:
    return json.dumps({"type": type_, **kwargs})


def _node_label(node: dict) -> str:
    d = node.get("data") or {}
    return d.get("label") or d.get("agentName") or d.get("text") or node.get("type", "node")


def _build_adj(nodes: list[dict], edges: list[dict]) -> dict[str, list[tuple[str, str]]]:
    """node_id → [(target_id, edge_condition_label)]"""
    adj: dict[str, list[tuple[str, str]]] = {n["id"]: [] for n in nodes}
    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src and tgt and src in adj:
            label = (e.get("data") or {}).get("label") or (e.get("data") or {}).get("condition") or ""
            adj[src].append((tgt, label))
    return adj


def _find_start(nodes: list[dict]) -> dict | None:
    for n in nodes:
        if n.get("type") == "triggerNode":
            return n
    return None


# ── LLM helpers ───────────────────────────────────────────────────────────────

MAX_TOOL_ROUNDS = 8


async def _stream_agent(
    node: dict,
    context: str,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """
    Async generator: runs an agent node (workflowStep with agentId) and yields
    node_token event strings. Accumulates full output into `_stream_agent.output`.
    """
    node_id = node["id"]
    data = node.get("data") or {}
    agent_id = data.get("agentId")

    system_prompt = ""
    tools_list: list = []

    if agent_id:
        try:
            from uuid import UUID
            result = await db.execute(
                select(Agent)
                .where(Agent.id == UUID(str(agent_id)))
                .options(selectinload(Agent.mcp_servers))
            )
            agent = result.scalar_one_or_none()
            if agent:
                ver_result = await db.execute(
                    select(AgentVersion)
                    .where(AgentVersion.agent_id == UUID(str(agent_id)))
                    .order_by(AgentVersion.version_number.desc())
                    .limit(1)
                )
                ver = ver_result.scalar_one_or_none()
                if ver and ver.prompt:
                    system_prompt = ver.prompt
                model_id = agent.model_id
                tools_list = await get_mcp_tools(agent.mcp_servers or [])
            else:
                model_id = None
        except Exception as exc:
            logger.warning("Failed to load agent %s: %s", agent_id, exc)
            model_id = None
    else:
        model_id = None

    if not system_prompt:
        system_prompt = (
            f"You are an AI agent executing a workflow task: '{_node_label(node)}'. "
            "Process the given input and produce a concise, useful result."
        )

    llm = await get_llm_by_id(db, str(model_id)) if model_id else await get_active_llm(db)
    llm_bound = llm.bind_tools(tools_list) if tools_list else llm
    tool_map = {t.name: t for t in tools_list}

    messages: list = [SystemMessage(content=system_prompt), HumanMessage(content=context)]

    try:
        for _ in range(MAX_TOOL_ROUNDS):
            try:
                response = await llm_bound.ainvoke(messages)
            except Exception as exc:
                if tools_list and "does not support tools" in str(exc):
                    response = await llm.ainvoke(messages)
                else:
                    raise
            messages.append(response)

            if not getattr(response, "tool_calls", None):
                content = response.content
                text = ""
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text += block.get("text", "")
                elif isinstance(content, str):
                    text = content
                if text:
                    yield _ev("node_token", node_id=node_id, text=text)
                break

            for tc in response.tool_calls:
                tool_name = tc["name"]
                note = f"[Tool: {tool_name}]\n"
                yield _ev("node_token", node_id=node_id, text=note)
                tool = tool_map.get(tool_name)
                try:
                    tool_result = await tool.ainvoke(tc["args"]) if tool else f"Unknown tool: {tool_name}"
                except Exception as exc:
                    tool_result = f"Tool error: {exc}"
                messages.append(ToolMessage(content=str(tool_result), tool_call_id=tc["id"]))
    except Exception as exc:
        yield _ev("node_token", node_id=node_id, text=f"[Error] {exc}")


async def _stream_task(
    node: dict,
    context: str,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """Generic task node without assigned agent — single LLM call."""
    node_id = node["id"]
    label = _node_label(node)
    desc = (node.get("data") or {}).get("description") or ""
    system_prompt = (
        f"You are an AI assistant executing a process step: '{label}'."
        + (f" {desc}" if desc else "")
        + " Process the input and produce a concise, useful result."
    )
    llm = await get_active_llm(db)
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=context)]
    try:
        response = await llm.ainvoke(messages)
        content = response.content
        text = ""
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text += block.get("text", "")
        elif isinstance(content, str):
            text = content
        if text:
            yield _ev("node_token", node_id=node_id, text=text)
    except Exception as exc:
        yield _ev("node_token", node_id=node_id, text=f"[Error] {exc}")


async def _pick_gateway_branch(
    successors: list[tuple[str, str]],
    context: str,
    db: AsyncSession,
) -> str:
    """Use the LLM to decide which outgoing edge to follow for an exclusive gateway."""
    if not successors:
        return ""
    labeled = [(t, l) for t, l in successors if l.strip()]
    if not labeled:
        return successors[0][0]
    conditions = "\n".join(f"- {l}" for _, l in labeled)
    prompt = (
        f"Given this context (last output):\n\n{context[:2000]}\n\n"
        f"Which condition best matches? Pick exactly one from:\n{conditions}\n\n"
        "Reply with only the exact condition text."
    )
    llm = await get_active_llm(db)
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        chosen = str(response.content).strip().lower()
        for tgt, lbl in labeled:
            if lbl.strip().lower() in chosen or chosen in lbl.strip().lower():
                return tgt
    except Exception as exc:
        logger.warning("Gateway routing failed: %s", exc)
    return labeled[0][0]


# ── Main executor ─────────────────────────────────────────────────────────────

async def execute_workflow(
    nodes: list[dict],
    edges: list[dict],
    input_message: str,
    db: AsyncSession,
    simulate: bool = False,
) -> AsyncGenerator[str, None]:
    """
    Yields SSE-ready JSON strings. Events:
      run_start | node_enter | node_token | node_exit | edge | run_done | run_error
    """
    node_map = {n["id"]: n for n in nodes}
    adj = _build_adj(nodes, edges)
    label_map = {n["id"]: _node_label(n) for n in nodes}

    start_node = _find_start(nodes)
    if not start_node:
        yield _ev("run_error", error="No start event (triggerNode) found in workflow.")
        return

    yield _ev("run_start", simulate=simulate)

    context = input_message.strip() or "Begin workflow execution."
    current_id: str | None = start_node["id"]
    visited: set[str] = set()
    final_output = context

    for _step in range(50):  # safety cap
        if current_id is None:
            break
        if current_id in visited:
            yield _ev("run_error", error=f"Cycle detected at '{label_map.get(current_id, current_id)}'.")
            return
        visited.add(current_id)

        node = node_map.get(current_id)
        if not node:
            break

        node_type = node.get("type", "")
        label = label_map.get(current_id, current_id)

        # Skip pure annotations
        if node_type == "annotation":
            successors = adj.get(current_id, [])
            current_id = successors[0][0] if successors else None
            continue

        yield _ev("node_enter", node_id=current_id, label=label, node_type=node_type)

        # ── End event ────────────────────────────────────────────────────────
        if node_type == "endEvent":
            yield _ev("node_exit", node_id=current_id, output="")
            yield _ev("run_done", final_output=final_output)
            return

        # ── Trigger (start) ──────────────────────────────────────────────────
        if node_type == "triggerNode":
            if simulate:
                await asyncio.sleep(0.25)
                yield _ev("node_token", node_id=current_id, text=f"Trigger received: {context}")
            yield _ev("node_exit", node_id=current_id, output=context)
            successors = adj.get(current_id, [])
            if successors:
                next_id = successors[0][0]
                yield _ev("edge", from_id=current_id, to_id=next_id,
                          from_label=label, to_label=label_map.get(next_id, next_id))
                current_id = next_id
            else:
                current_id = None
            continue

        # ── Gateway ──────────────────────────────────────────────────────────
        if node_type == "gateway":
            gw_type = (node.get("data") or {}).get("gatewayType", "exclusive")
            yield _ev("node_exit", node_id=current_id, output="")
            successors = adj.get(current_id, [])
            if not successors:
                current_id = None
                continue

            if gw_type == "parallel":
                # Execute all branches in sequence (full parallel LangGraph compile deferred)
                next_id = successors[0][0]
            elif simulate:
                next_id = successors[0][0]
            else:
                next_id = await _pick_gateway_branch(successors, context, db)

            yield _ev("edge", from_id=current_id, to_id=next_id,
                      from_label=label, to_label=label_map.get(next_id, next_id))
            current_id = next_id
            continue

        # ── Intermediate event ────────────────────────────────────────────────
        if node_type == "intermediateEvent":
            if simulate:
                await asyncio.sleep(0.3)
                event_type = (node.get("data") or {}).get("eventType", "timer")
                yield _ev("node_token", node_id=current_id, text=f"[{event_type.capitalize()} event] {label}")
            output = context
            yield _ev("node_exit", node_id=current_id, output=output)
            successors = adj.get(current_id, [])
            if successors:
                next_id = successors[0][0]
                yield _ev("edge", from_id=current_id, to_id=next_id,
                          from_label=label, to_label=label_map.get(next_id, next_id))
                current_id = next_id
            else:
                current_id = None
            continue

        # ── Task / AgentTask ─────────────────────────────────────────────────
        token_parts: list[str] = []

        if simulate:
            await asyncio.sleep(0.5)
            sim_text = f"[Simulated] {label}: Processed input and produced a result."
            yield _ev("node_token", node_id=current_id, text=sim_text)
            token_parts.append(sim_text)
        else:
            has_agent = bool((node.get("data") or {}).get("agentId"))
            stream_fn = _stream_agent if has_agent else _stream_task
            async for ev_str in stream_fn(node, context, db):
                yield ev_str
                try:
                    ev_data = json.loads(ev_str)
                    if ev_data.get("type") == "node_token":
                        token_parts.append(ev_data.get("text", ""))
                except Exception:
                    pass

        output = "".join(token_parts).strip() or context
        final_output = output
        context = output

        yield _ev("node_exit", node_id=current_id, output=output[:500])

        successors = adj.get(current_id, [])
        if not successors:
            break
        next_id = successors[0][0]
        yield _ev("edge", from_id=current_id, to_id=next_id,
                  from_label=label, to_label=label_map.get(next_id, next_id))
        current_id = next_id

    yield _ev("run_done", final_output=final_output)
