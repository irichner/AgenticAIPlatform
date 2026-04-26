from __future__ import annotations
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langgraph.types import interrupt
from langchain_core.messages import SystemMessage, AIMessage
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool
from app.agents.state import AgentState

# Tool names that require human approval before execution
HIGH_STAKES_TOOLS = {
    "submit_quota_adjustment",
    "approve_clawback",
    "override_commission",
    "update_compensation_plan",
    "bulk_territory_reassign",
}


def build_react_graph(
    llm: BaseChatModel,
    tools: list[BaseTool],
    system_prompt: str,
    checkpointer=None,
    enable_hil: bool = False,
):
    """
    ReAct loop: agent ↔ hil_check ↔ tools.
    When enable_hil=True the hil_check node will interrupt() for HIGH_STAKES_TOOLS,
    pausing execution until a human approves or rejects via the approvals API.
    """
    model = llm.bind_tools(tools) if tools else llm
    tool_node = ToolNode(tools)

    def call_model(state: AgentState) -> dict:
        msgs = list(state["messages"])
        # Build effective system prompt: base + optional RAG context
        full_prompt = system_prompt
        rag = state.get("rag_context", "")
        if rag:
            full_prompt = f"{system_prompt}\n\n{rag}"

        if not any(isinstance(m, SystemMessage) for m in msgs):
            msgs = [SystemMessage(content=full_prompt)] + msgs

        response = model.invoke(msgs)

        # Accumulate token usage from response metadata
        usage = dict(state.get("usage") or {})
        meta = getattr(response, "response_metadata", {}) or {}
        u = meta.get("usage", {})
        usage["input_tokens"] = usage.get("input_tokens", 0) + u.get("input_tokens", 0)
        usage["output_tokens"] = usage.get("output_tokens", 0) + u.get("output_tokens", 0)

        return {"messages": [response], "usage": usage}

    def router(state: AgentState) -> str:
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "hil_check" if enable_hil else "tools"
        return END

    def hil_check(state: AgentState) -> dict:
        """Check if the pending tool call needs human approval."""
        last_ai = next(
            (m for m in reversed(state["messages"]) if getattr(m, "tool_calls", None)),
            None,
        )
        if last_ai is None:
            return {}

        for tc in last_ai.tool_calls:
            if tc["name"] in HIGH_STAKES_TOOLS:
                decision = interrupt({
                    "tool_name": tc["name"],
                    "tool_args": tc.get("args", {}),
                    "message": f"Agent wants to call '{tc['name']}'. Approve?",
                })
                if not decision.get("approved", False):
                    return {
                        "messages": [
                            AIMessage(content=f"[HIL_REJECTED] Action '{tc['name']}' was rejected by a human reviewer.")
                        ]
                    }
        return {}

    def hil_router(state: AgentState) -> str:
        """After hil_check: route to END on rejection, else continue to tools."""
        last = state["messages"][-1]
        if hasattr(last, "content") and str(last.content).startswith("[HIL_REJECTED]"):
            return END
        return "tools"

    g = StateGraph(AgentState)
    g.add_node("agent", call_model)
    g.add_node("tools", tool_node)

    if enable_hil:
        g.add_node("hil_check", hil_check)
        g.add_conditional_edges("agent", router, {"hil_check": "hil_check", END: END})
        g.add_conditional_edges("hil_check", hil_router, {"tools": "tools", END: END})
    else:
        g.add_conditional_edges("agent", router, {"tools": "tools", END: END})

    g.add_edge("tools", "agent")
    g.set_entry_point("agent")

    return g.compile(checkpointer=checkpointer)
