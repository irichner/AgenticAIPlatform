"""Source adapters for the external catalog.

Each adapter fetches items from one upstream API and normalises them into
NormalizedItem so the sync engine never needs to know about upstream schemas.

Phase 1 — no-auth sources only:
  - HuggingFaceAdapter  (models)
  - McpRegistryAdapter  (mcp_servers)
  - PulseMcpAdapter     (mcp_servers)
"""
from __future__ import annotations
from dataclasses import dataclass, field

import httpx


@dataclass
class NormalizedItem:
    external_id: str
    kind: str
    payload: dict = field(default_factory=dict)


class HuggingFaceAdapter:
    id = "huggingface"
    kind = "models"

    async def fetch(self, creds: dict | None = None) -> list[NormalizedItem]:
        params = {
            "pipeline_tag": "text-generation",
            "sort": "downloads",
            "direction": -1,
            "limit": 100,
            "full": "False",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get("https://huggingface.co/api/models", params=params)
            resp.raise_for_status()

        items: list[NormalizedItem] = []
        for m in resp.json():
            mid: str = m.get("id") or m.get("modelId") or ""
            if not mid:
                continue
            items.append(NormalizedItem(
                external_id=mid,
                kind="model",
                payload={
                    "id": mid,
                    "name": mid.split("/")[-1],
                    "author": m.get("author"),
                    "downloads": m.get("downloads", 0),
                    "likes": m.get("likes", 0),
                    "tags": m.get("tags", []),
                    "pipeline_tag": m.get("pipeline_tag"),
                    "source": "huggingface",
                },
            ))
        return items


class McpRegistryAdapter:
    id = "mcp_registry"
    kind = "mcp_servers"

    async def fetch(self, creds: dict | None = None) -> list[NormalizedItem]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                "https://registry.modelcontextprotocol.io/v0.1/servers"
            )
            resp.raise_for_status()

        data = resp.json()
        # Response: {"servers": [{"server": {...}, "_meta": {...}}, ...]}
        raw_list: list[dict] = (
            data if isinstance(data, list) else data.get("servers", [])
        )

        items: list[NormalizedItem] = []
        for entry in raw_list:
            # Unwrap the nested "server" envelope
            s: dict = entry.get("server", entry)
            sid = str(s.get("name") or s.get("id") or "")
            if not sid:
                continue
            # Prefer the first streamable-http remote URL, fall back to any remote
            remotes: list[dict] = s.get("remotes", [])
            url = next(
                (r["url"] for r in remotes if r.get("url")),
                None,
            )
            items.append(NormalizedItem(
                external_id=sid,
                kind="mcp_server",
                payload={
                    "id": sid,
                    "name": s.get("title") or sid,
                    "description": s.get("description"),
                    "url": url,
                    "transport": (remotes[0].get("type", "streamable_http").replace("-", "_")
                                  if remotes else "streamable_http"),
                    "tags": [],
                    "source": "mcp_registry",
                },
            ))
        return items


class PulseMcpAdapter:
    id = "pulsemcp"
    kind = "mcp_servers"

    async def fetch(self, creds: dict | None = None) -> list[NormalizedItem]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                "https://www.pulsemcp.com/api/servers",
                params={"count_per_page": 100},
            )
            resp.raise_for_status()

        data = resp.json()
        servers: list[dict] = (
            data if isinstance(data, list)
            else data.get("servers", data.get("data", []))
        )

        items: list[NormalizedItem] = []
        for s in servers:
            sid = str(s.get("id") or s.get("slug") or s.get("name") or "")
            if not sid:
                continue
            items.append(NormalizedItem(
                external_id=sid,
                kind="mcp_server",
                payload={
                    "id": sid,
                    "name": s.get("name", sid),
                    "description": s.get("description") or s.get("short_description"),
                    "url": s.get("github_url") or s.get("url"),
                    "downloads": s.get("github_stars", 0),
                    "tags": s.get("tags", []),
                    "source": "pulsemcp",
                },
            ))
        return items


ADAPTERS: dict[str, HuggingFaceAdapter | McpRegistryAdapter | PulseMcpAdapter] = {
    "huggingface":  HuggingFaceAdapter(),
    "mcp_registry": McpRegistryAdapter(),
    "pulsemcp":     PulseMcpAdapter(),
}
