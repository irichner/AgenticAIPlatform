"""
Agent executor — runs a LangGraph agent for a given Run record.

Flow:
  create_run (router) → background_task → execute_run
                                         ↓
                             publishes events to Redis channel run:<run_id>
                             updates Run.status in DB throughout

SSE clients subscribe to that channel via GET /api/runs/{run_id}/stream.
HIL: when a graph interrupt is detected the run status becomes
     'awaiting_approval'. POST /api/approvals/{id}/decide triggers
     execute_run_resume() to continue from the checkpoint.
"""
from __future__ import annotations

import json
import time
import uuid

from datetime import datetime, timezone

from langchain_core.messages import HumanMessage
from sqlalchemy import select

from app.agents.db_tools import build_db_tools
from app.agents.graph import build_react_graph
from app.agents.llm import get_active_llm_with_model, get_llm_and_model_by_id
from app.agents.prebuilt import get_prebuilt_graph
from app.core.mcp_client import get_mcp_tools
from app.core.rag import get_rag_context
from app.core.redis_client import get_redis
from app.models.agent import Agent, AgentVersion
from app.models.agent_tool_allowlist import AgentToolAllowlist
from app.models.approval_request import ApprovalRequest
from app.models.business_unit import BusinessUnit
from app.models.mcp_tool import McpTool
from app.models.run import Run

_COST_PER_1K = {
    "claude-sonnet-4-6": {"input": 0.003, "output": 0.015},
    "claude-opus-4-7": {"input": 0.015, "output": 0.075},
    "claude-haiku-4-5": {"input": 0.00025, "output": 0.00125},
}


def _estimate_cost(model: str | None, input_tokens: int, output_tokens: int) -> float:
    rates = _COST_PER_1K.get(model, {"input": 0.003, "output": 0.015})
    return (input_tokens / 1000) * rates["input"] + (output_tokens / 1000) * rates["output"]


async def execute_run(run_id: str) -> None:
    """Background task: execute a run from scratch."""
    from app.db.engine import AsyncSessionLocal

    redis = get_redis()
    channel = f"run:{run_id}"

    async with AsyncSessionLocal() as db:
        run_res = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id)))
        run = run_res.scalar_one()

        agent_res = await db.execute(select(Agent).where(Agent.id == run.agent_id))
        agent = agent_res.scalar_one()

        version_res = await db.execute(
            select(AgentVersion).where(AgentVersion.id == run.agent_version_id)
        )
        version = version_res.scalar_one_or_none()

        run.status = "running"
        await db.commit()

        await redis.publish(channel, json.dumps({
            "event": "start",
            "run_id": run_id,
            "agent_name": agent.name,
        }))

        try:
            # Resolve org_id from business unit (needed before LLM selection)
            bu_res = await db.execute(select(BusinessUnit).where(BusinessUnit.id == agent.business_unit_id))
            bu = bu_res.scalar_one_or_none()
            org_id = bu.org_id if bu else None

            # Select LLM: prefer agent's assigned model, fall back to org default
            if agent.model_id:
                llm, ai_model = await get_llm_and_model_by_id(db, agent.model_id)
            else:
                llm, ai_model = await get_active_llm_with_model(db, org_id=org_id)

            if llm is None:
                raise RuntimeError("No AI model configured. Go to Admin → AI to add one.")

            agent_type = None
            if version and version.graph_definition:
                agent_type = version.graph_definition.get("type")

            rag_context = await get_rag_context(
                db, agent.business_unit_id, (run.input or {}).get("message", "")
            )
            if rag_context:
                await redis.publish(channel, json.dumps({
                    "event": "rag_context",
                    "run_id": run_id,
                    "chunks_found": rag_context.count("["),
                }))

            if org_id:
                from app.agents.rate_limit import check_agent_run_rate, AgentRateLimitError
                try:
                    await check_agent_run_rate(org_id, user_id=run.triggered_by)
                except AgentRateLimitError as rl_exc:
                    run.status = "failed"
                    run.error = str(rl_exc)
                    await db.commit()
                    await redis.publish(channel, json.dumps({
                        "event": "error", "run_id": run_id, "error": str(rl_exc),
                    }))
                    return

            # Only load tools if the model supports function calling.
            # Manually-configured models (capabilities=None) are assumed to support it.
            model_caps = ai_model.capabilities if ai_model else None
            supports_tools = model_caps is None or "tool_use" in model_caps

            mcp_tools: list = []
            db_agent_tools: list = []
            if supports_tools:
                mcp_tools = await get_mcp_tools(agent.mcp_servers or [])
                db_agent_tools = await build_db_tools(str(agent.id), org_id, db) if org_id else []

                # Apply per-agent MCP tool allowlist (no rows = all tools allowed)
                allowlist_res = await db.execute(
                    select(AgentToolAllowlist.mcp_tool_id).where(AgentToolAllowlist.agent_id == agent.id)
                )
                allowed_tool_ids = list(allowlist_res.scalars())
                if allowed_tool_ids:
                    allowed_names_res = await db.execute(
                        select(McpTool.name).where(McpTool.id.in_(allowed_tool_ids))
                    )
                    allowed_names = set(allowed_names_res.scalars())
                    mcp_tools = [t for t in mcp_tools if t.name in allowed_names]
            else:
                await redis.publish(channel, json.dumps({
                    "event": "message",
                    "run_id": run_id,
                    "node": "system",
                    "type": "SystemMessage",
                    "content": (
                        f"⚠️ Model '{ai_model.model_id}' does not support tool use — "
                        "MCP and database tools are disabled for this run."
                    ),
                }))

            tools = mcp_tools + db_agent_tools

            from app.core.checkpointer import get_checkpointer
            checkpointer = await get_checkpointer()
            enable_hil = checkpointer is not None

            compiled = get_prebuilt_graph(agent_type, llm, tools) if agent_type else None
            if compiled is None:
                system_prompt = (
                    version.prompt
                    if version and version.prompt
                    else agent.description or f"You are {agent.name}, an intelligent agent."
                )
                compiled = build_react_graph(
                    llm, tools, system_prompt,
                    checkpointer=checkpointer,
                    enable_hil=enable_hil,
                )

            user_input = (run.input or {}).get("message", "") or "Run"
            config = {"configurable": {"thread_id": run_id}}
            initial_state = {
                "messages": [HumanMessage(content=user_input)],
                "run_id": run_id,
                "rag_context": rag_context,
                "usage": {},
            }

            final_messages: list = []
            interrupt_payload: dict | None = None
            accumulated_usage: dict = {}

            async for chunk in compiled.astream(initial_state, config=config):
                for node_name, node_state in chunk.items():
                    if node_name == "__interrupt__":
                        interrupts = node_state if isinstance(node_state, (list, tuple)) else [node_state]
                        if interrupts:
                            intr = interrupts[0]
                            interrupt_payload = intr.value if hasattr(intr, "value") else intr
                        break

                    node_start = time.monotonic()
                    await redis.publish(channel, json.dumps({
                        "event": "node_enter",
                        "run_id": run_id,
                        "node": node_name,
                    }))

                    if isinstance(node_state, dict):
                        if "usage" in node_state and node_state["usage"]:
                            accumulated_usage = node_state["usage"]

                        for msg in node_state.get("messages", []):
                            final_messages.append(msg)
                            msg_type = type(msg).__name__
                            if msg_type == "ToolMessage":
                                await redis.publish(channel, json.dumps({
                                    "event": "tool_response",
                                    "run_id": run_id,
                                    "node": node_name,
                                    "tool_name": getattr(msg, "name", None),
                                    "content": msg.content if hasattr(msg, "content") else "",
                                }))
                            elif getattr(msg, "tool_calls", None):
                                for tc in msg.tool_calls:
                                    await redis.publish(channel, json.dumps({
                                        "event": "tool_call",
                                        "run_id": run_id,
                                        "node": node_name,
                                        "tool_name": tc["name"],
                                        "tool_args": tc.get("args", {}),
                                    }))
                            else:
                                await redis.publish(channel, json.dumps({
                                    "event": "message",
                                    "run_id": run_id,
                                    "node": node_name,
                                    "type": msg_type,
                                    "content": msg.content if hasattr(msg, "content") else "",
                                }))

                    node_latency_ms = round((time.monotonic() - node_start) * 1000)
                    await redis.publish(channel, json.dumps({
                        "event": "node_exit",
                        "run_id": run_id,
                        "node": node_name,
                        "latency_ms": node_latency_ms,
                        "tokens_used": accumulated_usage.get("input_tokens", 0) + accumulated_usage.get("output_tokens", 0),
                        "cost_usd": round(_estimate_cost(None, accumulated_usage.get("input_tokens", 0), accumulated_usage.get("output_tokens", 0)), 6),
                    }))
                    await redis.publish(channel, json.dumps({
                        "event": "state_snapshot",
                        "run_id": run_id,
                        "node": node_name,
                        "state": {
                            "messages_count": len(final_messages),
                            "usage": accumulated_usage,
                        },
                    }))

            # ── Handle HIL interrupt ──────────────────────────────────────────
            if interrupt_payload is not None:
                approval = ApprovalRequest(
                    org_id=org_id,
                    run_id=uuid.UUID(run_id),
                    agent_id=agent.id,
                    thread_id=run_id,
                    tool_name=interrupt_payload.get("tool_name"),
                    tool_args=interrupt_payload.get("tool_args"),
                    status="pending",
                )
                db.add(approval)
                run.status = "awaiting_approval"
                await db.commit()
                await db.refresh(approval)

                await redis.publish(channel, json.dumps({
                    "event": "approval_request",
                    "run_id": run_id,
                    "approval_id": str(approval.id),
                    "tool_name": interrupt_payload.get("tool_name"),
                    "message": interrupt_payload.get("message", "Human approval required"),
                }))
                return

            # ── Normal completion ─────────────────────────────────────────────
            final_content = ""
            for msg in reversed(final_messages):
                if (
                    hasattr(msg, "content")
                    and msg.content
                    and not getattr(msg, "tool_calls", None)
                    and type(msg).__name__ != "ToolMessage"
                ):
                    final_content = msg.content
                    break

            input_tokens = accumulated_usage.get("input_tokens", 0)
            output_tokens = accumulated_usage.get("output_tokens", 0)

            run.status = "completed"
            run.output = {
                "content": final_content,
                "messages_count": len(final_messages),
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                    "estimated_cost_usd": round(_estimate_cost(None, input_tokens, output_tokens), 6),
                },
            }
            run.completed_at = datetime.now(timezone.utc)
            await db.commit()

            await redis.publish(channel, json.dumps({
                "event": "complete",
                "run_id": run_id,
                "output": run.output,
            }))

        except Exception as exc:
            run.status = "failed"
            run.error = str(exc)
            await db.commit()
            await redis.publish(channel, json.dumps({
                "event": "error",
                "run_id": run_id,
                "error": str(exc),
            }))
            import logging
            logging.getLogger(__name__).error("Run %s failed: %s", run_id, exc, exc_info=True)


async def execute_run_resume(
    run_id: str,
    thread_id: str,
    approved: bool,
    checkpointer,
) -> None:
    """Resume a HIL-interrupted run after a human decision."""
    from app.db.engine import AsyncSessionLocal
    from langgraph.types import Command

    redis = get_redis()
    channel = f"run:{run_id}"

    async with AsyncSessionLocal() as db:
        run_res = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id)))
        run = run_res.scalar_one()

        agent_res = await db.execute(select(Agent).where(Agent.id == run.agent_id))
        agent = agent_res.scalar_one()

        version_res = await db.execute(
            select(AgentVersion).where(AgentVersion.id == run.agent_version_id)
        )
        version = version_res.scalar_one_or_none()

        run.status = "running"
        await db.commit()

        try:
            bu_res2 = await db.execute(select(BusinessUnit).where(BusinessUnit.id == agent.business_unit_id))
            bu2 = bu_res2.scalar_one_or_none()
            org_id2 = bu2.org_id if bu2 else None

            if agent.model_id:
                llm, ai_model2 = await get_llm_and_model_by_id(db, agent.model_id)
            else:
                llm, ai_model2 = await get_active_llm_with_model(db, org_id=org_id2)

            if llm is None:
                raise RuntimeError("No AI model configured. Go to Admin → AI to add one.")

            if org_id2:
                from app.agents.rate_limit import check_agent_run_rate, AgentRateLimitError
                try:
                    await check_agent_run_rate(org_id2, user_id=run.triggered_by)
                except AgentRateLimitError as rl_exc:
                    run.status = "failed"
                    run.error = str(rl_exc)
                    await db.commit()
                    await redis.publish(channel, json.dumps({
                        "event": "error", "run_id": run_id, "error": str(rl_exc),
                    }))
                    return

            model_caps2 = ai_model2.capabilities if ai_model2 else None
            supports_tools2 = model_caps2 is None or "tool_use" in model_caps2

            mcp_tools2: list = []
            db_agent_tools2: list = []
            if supports_tools2:
                mcp_tools2 = await get_mcp_tools(agent.mcp_servers or [])
                db_agent_tools2 = await build_db_tools(str(agent.id), org_id2, db) if org_id2 else []

                allowlist_res2 = await db.execute(
                    select(AgentToolAllowlist.mcp_tool_id).where(AgentToolAllowlist.agent_id == agent.id)
                )
                allowed_tool_ids2 = list(allowlist_res2.scalars())
                if allowed_tool_ids2:
                    allowed_names_res2 = await db.execute(
                        select(McpTool.name).where(McpTool.id.in_(allowed_tool_ids2))
                    )
                    allowed_names2 = set(allowed_names_res2.scalars())
                    mcp_tools2 = [t for t in mcp_tools2 if t.name in allowed_names2]

            tools = mcp_tools2 + db_agent_tools2

            agent_type = None
            if version and version.graph_definition:
                agent_type = version.graph_definition.get("type")

            compiled = get_prebuilt_graph(agent_type, llm, tools) if agent_type else None
            if compiled is None:
                system_prompt = (
                    version.prompt
                    if version and version.prompt
                    else agent.description or f"You are {agent.name}, an intelligent agent."
                )
                compiled = build_react_graph(
                    llm, tools, system_prompt,
                    checkpointer=checkpointer,
                    enable_hil=True,
                )

            config = {"configurable": {"thread_id": thread_id}}
            resume_command = Command(resume={"approved": approved})

            final_messages: list = []
            accumulated_usage: dict = {}

            async for chunk in compiled.astream(resume_command, config=config):
                for node_name, node_state in chunk.items():
                    if node_name == "__interrupt__":
                        break

                    node_start = time.monotonic()
                    await redis.publish(channel, json.dumps({
                        "event": "node_enter",
                        "run_id": run_id,
                        "node": node_name,
                    }))

                    if isinstance(node_state, dict):
                        if "usage" in node_state and node_state["usage"]:
                            accumulated_usage = node_state["usage"]
                        for msg in node_state.get("messages", []):
                            final_messages.append(msg)
                            msg_type = type(msg).__name__
                            if msg_type == "ToolMessage":
                                await redis.publish(channel, json.dumps({
                                    "event": "tool_response",
                                    "run_id": run_id,
                                    "node": node_name,
                                    "tool_name": getattr(msg, "name", None),
                                    "content": msg.content if hasattr(msg, "content") else "",
                                }))
                            elif getattr(msg, "tool_calls", None):
                                for tc in msg.tool_calls:
                                    await redis.publish(channel, json.dumps({
                                        "event": "tool_call",
                                        "run_id": run_id,
                                        "node": node_name,
                                        "tool_name": tc["name"],
                                        "tool_args": tc.get("args", {}),
                                    }))
                            else:
                                await redis.publish(channel, json.dumps({
                                    "event": "message",
                                    "run_id": run_id,
                                    "node": node_name,
                                    "type": msg_type,
                                    "content": msg.content if hasattr(msg, "content") else "",
                                }))

                    node_latency_ms = round((time.monotonic() - node_start) * 1000)
                    await redis.publish(channel, json.dumps({
                        "event": "node_exit",
                        "run_id": run_id,
                        "node": node_name,
                        "latency_ms": node_latency_ms,
                        "tokens_used": accumulated_usage.get("input_tokens", 0) + accumulated_usage.get("output_tokens", 0),
                        "cost_usd": round(_estimate_cost(None, accumulated_usage.get("input_tokens", 0), accumulated_usage.get("output_tokens", 0)), 6),
                    }))
                    await redis.publish(channel, json.dumps({
                        "event": "state_snapshot",
                        "run_id": run_id,
                        "node": node_name,
                        "state": {
                            "messages_count": len(final_messages),
                            "usage": accumulated_usage,
                        },
                    }))

            final_content = ""
            for msg in reversed(final_messages):
                if (
                    hasattr(msg, "content")
                    and msg.content
                    and not getattr(msg, "tool_calls", None)
                    and type(msg).__name__ != "ToolMessage"
                ):
                    final_content = msg.content
                    break

            input_tokens = accumulated_usage.get("input_tokens", 0)
            output_tokens = accumulated_usage.get("output_tokens", 0)

            run.status = "completed"
            run.output = {
                "content": final_content,
                "messages_count": len(final_messages),
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                    "estimated_cost_usd": round(_estimate_cost(None, input_tokens, output_tokens), 6),
                },
            }
            run.completed_at = datetime.now(timezone.utc)
            await db.commit()

            await redis.publish(channel, json.dumps({
                "event": "complete",
                "run_id": run_id,
                "output": run.output,
            }))

        except Exception as exc:
            run.status = "failed"
            run.error = str(exc)
            await db.commit()
            await redis.publish(channel, json.dumps({
                "event": "error",
                "run_id": run_id,
                "error": str(exc),
            }))
            import logging
            logging.getLogger(__name__).error("Run %s (resume) failed: %s", run_id, exc, exc_info=True)
