from __future__ import annotations
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool

_REGISTRY: dict[str, tuple[str, str]] = {
    "quota_forecaster": (
        "Quota Forecaster",
        "app.agents.prebuilt.quota_forecaster",
    ),
    "spif_optimizer": (
        "SPIF Optimizer",
        "app.agents.prebuilt.spif_optimizer",
    ),
    "clawback_detector": (
        "Clawback Detector",
        "app.agents.prebuilt.clawback_detector",
    ),
}


def list_prebuilt_types() -> list[str]:
    return list(_REGISTRY.keys())


def get_prebuilt_graph(agent_type: str, llm: BaseChatModel, tools: list[BaseTool]):
    """Return a compiled LangGraph for the given agent_type, or None if unknown."""
    entry = _REGISTRY.get(agent_type)
    if entry is None:
        return None
    _, module_path = entry
    import importlib
    module = importlib.import_module(module_path)
    return module.build(llm, tools)


PREBUILT_META = {
    k: {"name": v[0], "type": k} for k, v in _REGISTRY.items()
}
