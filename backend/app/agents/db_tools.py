"""
Dynamic database tools for LangGraph agents, controlled by AgentDbPolicy records.

For each enabled policy attached to an agent, this module generates typed
LangChain StructuredTool objects that:
  - Always scope reads/writes to the agent's org via org_id injection
  - Validate column access against the policy's allowlist / blocklist
  - Use fully parameterized queries (zero SQL injection surface)
  - Cache table column metadata for the lifetime of the process

Tools generated per policy (based on allowed_operations):
  db_read_{table}    — SELECT with filters, pagination, sorting
  db_create_{table}  — INSERT returning the new row
  db_update_{table}  — UPDATE by id returning the updated row
  db_delete_{table}  — DELETE by id
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Process-level cache: table_name → list[column_name]
_column_cache: dict[str, list[str]] = {}
# Process-level cache: table_name → bool (does the table have an org_id column?)
_has_org_id_cache: dict[str, bool] = {}


# ── Schema discovery ──────────────────────────────────────────────────────────

async def _get_table_columns(table_name: str, db: AsyncSession) -> list[str]:
    if table_name in _column_cache:
        return _column_cache[table_name]

    result = await db.execute(
        text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = :tbl AND table_schema = 'public'
            ORDER BY ordinal_position
        """),
        {"tbl": table_name},
    )
    cols = [row[0] for row in result.fetchall()]
    _column_cache[table_name] = cols
    _has_org_id_cache[table_name] = "org_id" in cols
    return cols


def _resolve_columns(
    all_columns: list[str],
    allowlist: list[str] | None,
    blocklist: list[str] | None,
) -> list[str]:
    cols = all_columns if allowlist is None else [c for c in all_columns if c in allowlist]
    if blocklist:
        cols = [c for c in cols if c not in blocklist]
    return cols or all_columns


# ── Public entry point ────────────────────────────────────────────────────────

async def build_db_tools(
    agent_id: str,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> list:
    """
    Load all enabled AgentDbPolicy records for this agent and return a list
    of LangChain StructuredTool objects ready to be added to the agent graph.
    """
    from app.models.agent_db_policy import AgentDbPolicy

    result = await db.execute(
        select(AgentDbPolicy).where(
            AgentDbPolicy.agent_id == uuid.UUID(agent_id),
            AgentDbPolicy.org_id == org_id,
            AgentDbPolicy.enabled == True,  # noqa: E712
        )
    )
    policies = result.scalars().all()

    tools: list = []
    for policy in policies:
        try:
            policy_tools = await _build_policy_tools(policy, org_id, db)
            tools.extend(policy_tools)
        except Exception as exc:
            logger.warning(
                "Skipping DB policy %s (table=%s): %s", policy.id, policy.table_name, exc
            )

    if tools:
        logger.info(
            "Built %d DB tools for agent %s (org %s)", len(tools), agent_id, org_id
        )
    return tools


# ── Per-policy tool builder ───────────────────────────────────────────────────

async def _build_policy_tools(policy, org_id: uuid.UUID, db: AsyncSession) -> list:
    table_name: str = policy.table_name
    ops: list[str] = policy.allowed_operations or ["select"]
    max_rows: int = min(policy.row_limit or 100, 5000)

    all_cols = await _get_table_columns(table_name, db)
    if not all_cols:
        logger.warning("Table %r not found — skipping DB policy", table_name)
        return []

    has_org_id = _has_org_id_cache.get(table_name, False)
    allowed_cols = _resolve_columns(all_cols, policy.column_allowlist, policy.column_blocklist)

    # Columns the LLM may write to (exclude generated/protected columns)
    _PROTECTED = {"id", "created_at", "updated_at", "org_id"}
    writable_cols = [c for c in allowed_cols if c not in _PROTECTED]

    tools = []
    if "select" in ops:
        tools.append(_make_read_tool(table_name, org_id, allowed_cols, has_org_id, max_rows))
    if "insert" in ops:
        tools.append(_make_create_tool(table_name, org_id, writable_cols, has_org_id))
    if "update" in ops:
        tools.append(_make_update_tool(table_name, org_id, writable_cols, has_org_id))
    if "delete" in ops:
        tools.append(_make_delete_tool(table_name, org_id, has_org_id))
    return tools


# ── Tool factories ────────────────────────────────────────────────────────────

def _make_read_tool(table_name, org_id, allowed_cols, has_org_id, max_rows):
    # Schema defined here so limit default and ceiling match the policy's row_limit
    class _ReadInput(BaseModel):
        filters: dict[str, Any] = Field(
            default_factory=dict,
            description='Equality filters as {column: value}. Example: {"status": "active"}',
        )
        columns: list[str] = Field(
            default_factory=list,
            description="Columns to return. Empty list returns all allowed columns.",
        )
        limit: int = Field(
            default=max_rows, ge=1, le=max_rows,
            description=f"Rows to return (policy max: {max_rows}). Use offset to paginate.",
        )
        offset: int = Field(default=0, ge=0, description="Row offset for pagination")
        sort_by: str = Field(default="", description="Column name to sort by")
        sort_desc: bool = Field(default=False, description="Sort descending when true")

    async def _read(
        filters: dict[str, Any] = {},
        columns: list[str] = [],
        limit: int = max_rows,
        offset: int = 0,
        sort_by: str = "",
        sort_desc: bool = False,
    ) -> str:
        from app.db.engine import AsyncSessionLocal
        from app.db.rls import set_rls_org
        async with AsyncSessionLocal() as db:
            await set_rls_org(db, org_id)
            select_cols = (
                [c for c in columns if c in allowed_cols] or allowed_cols
            )
            col_sql = ", ".join(f'"{c}"' for c in select_cols)

            where_clauses: list[str] = []
            params: dict[str, Any] = {
                "lim": min(limit, max_rows),
                "off": offset,
            }

            if has_org_id:
                where_clauses.append("org_id = :_org_id")
                params["_org_id"] = str(org_id)

            for i, (col, val) in enumerate(filters.items()):
                if col in allowed_cols:
                    where_clauses.append(f'"{col}" = :f{i}')
                    params[f"f{i}"] = val

            where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

            order_sql = ""
            if sort_by and sort_by in allowed_cols:
                direction = "DESC" if sort_desc else "ASC"
                order_sql = f'ORDER BY "{sort_by}" {direction}'

            sql = (
                f'SELECT {col_sql} FROM "{table_name}" '
                f"{where_sql} {order_sql} LIMIT :lim OFFSET :off"
            )
            result = await db.execute(text(sql), params)
            rows = [dict(row._mapping) for row in result.fetchall()]
            return json.dumps(rows, default=str)

    return StructuredTool.from_function(
        coroutine=_read,
        name=f"db_read_{table_name}",
        description=(
            f"Read rows from the {table_name} table. "
            f"Returns up to {max_rows} rows per call (use offset to paginate). "
            f"Available columns: {', '.join(allowed_cols)}. "
            "Results are always scoped to the current org."
        ),
        args_schema=_ReadInput,
    )


class _CreateInput(BaseModel):
    data: dict[str, Any] = Field(description="Column-value pairs for the new record")


def _make_create_tool(table_name, org_id, writable_cols, has_org_id):
    async def _create(data: dict[str, Any]) -> str:
        from app.db.engine import AsyncSessionLocal
        from app.db.rls import set_rls_org
        async with AsyncSessionLocal() as db:
            await set_rls_org(db, org_id)
            safe = {k: v for k, v in data.items() if k in writable_cols}
            if not safe:
                return json.dumps({"error": "No valid writable columns provided"})

            if has_org_id:
                safe["org_id"] = str(org_id)

            cols_sql = ", ".join(f'"{c}"' for c in safe)
            vals_sql = ", ".join(f":v_{c}" for c in safe)
            params = {f"v_{c}": v for c, v in safe.items()}

            sql = f'INSERT INTO "{table_name}" ({cols_sql}) VALUES ({vals_sql}) RETURNING *'
            result = await db.execute(text(sql), params)
            await db.commit()
            row = result.fetchone()
            return json.dumps(dict(row._mapping) if row else {}, default=str)

    return StructuredTool.from_function(
        coroutine=_create,
        name=f"db_create_{table_name}",
        description=(
            f"Insert a new row into {table_name}. "
            f"Writable columns: {', '.join(writable_cols)}. "
            "org_id is auto-injected; id, created_at, updated_at are server-generated."
        ),
        args_schema=_CreateInput,
    )


class _UpdateInput(BaseModel):
    record_id: str = Field(description="UUID of the record to update")
    data: dict[str, Any] = Field(description="Column-value pairs to update")


def _make_update_tool(table_name, org_id, writable_cols, has_org_id):
    async def _update(record_id: str, data: dict[str, Any]) -> str:
        from app.db.engine import AsyncSessionLocal
        from app.db.rls import set_rls_org
        async with AsyncSessionLocal() as db:
            await set_rls_org(db, org_id)
            safe = {k: v for k, v in data.items() if k in writable_cols}
            if not safe:
                return json.dumps({"error": "No valid columns to update"})

            set_clauses = [f'"{c}" = :u_{c}' for c in safe]
            params: dict[str, Any] = {f"u_{c}": v for c, v in safe.items()}
            params["_rid"] = record_id

            where_clauses = ["id = :_rid"]
            if has_org_id:
                where_clauses.append("org_id = :_org_id")
                params["_org_id"] = str(org_id)

            sql = (
                f'UPDATE "{table_name}" '
                f'SET {", ".join(set_clauses)} '
                f'WHERE {" AND ".join(where_clauses)} '
                "RETURNING *"
            )
            result = await db.execute(text(sql), params)
            await db.commit()
            row = result.fetchone()
            return json.dumps(
                dict(row._mapping) if row else {"error": "Record not found or not in this org"},
                default=str,
            )

    return StructuredTool.from_function(
        coroutine=_update,
        name=f"db_update_{table_name}",
        description=(
            f"Update a row in {table_name} by id. "
            f"Updatable columns: {', '.join(writable_cols)}. "
            "Always org-scoped — cannot update records belonging to another org."
        ),
        args_schema=_UpdateInput,
    )


class _DeleteInput(BaseModel):
    record_id: str = Field(description="UUID of the record to delete")


def _make_delete_tool(table_name, org_id, has_org_id):
    async def _delete(record_id: str) -> str:
        from app.db.engine import AsyncSessionLocal
        from app.db.rls import set_rls_org
        async with AsyncSessionLocal() as db:
            await set_rls_org(db, org_id)
            params: dict[str, Any] = {"_rid": record_id}
            where_clauses = ["id = :_rid"]
            if has_org_id:
                where_clauses.append("org_id = :_org_id")
                params["_org_id"] = str(org_id)

            sql = (
                f'DELETE FROM "{table_name}" '
                f'WHERE {" AND ".join(where_clauses)} '
                "RETURNING id"
            )
            result = await db.execute(text(sql), params)
            await db.commit()
            row = result.fetchone()
            deleted_id = str(row[0]) if row else None
            return json.dumps({"deleted_id": deleted_id, "table": table_name})

    return StructuredTool.from_function(
        coroutine=_delete,
        name=f"db_delete_{table_name}",
        description=(
            f"Delete a row from {table_name} by id. "
            "Always org-scoped — cannot delete records belonging to another org."
        ),
        args_schema=_DeleteInput,
    )


# ── Table discovery helper (used by the REST API) ─────────────────────────────

async def list_available_tables(db: AsyncSession) -> list[dict]:
    """Return all public tables with their column metadata — used by the policy UI."""
    result = await db.execute(
        text("""
            SELECT
                t.table_name,
                json_agg(
                    json_build_object(
                        'name', c.column_name,
                        'type', c.data_type,
                        'nullable', c.is_nullable = 'YES'
                    )
                    ORDER BY c.ordinal_position
                ) AS columns,
                bool_or(c.column_name = 'org_id') AS has_org_id
            FROM information_schema.tables t
            JOIN information_schema.columns c
                ON c.table_name = t.table_name AND c.table_schema = t.table_schema
            WHERE t.table_schema = 'public'
              AND t.table_type = 'BASE TABLE'
              AND t.table_name NOT LIKE 'alembic_%'
              AND t.table_name NOT LIKE 'langgraph_%'
            GROUP BY t.table_name
            ORDER BY t.table_name
        """)
    )
    return [
        {
            "table_name": row.table_name,
            "columns": row.columns,
            "has_org_id": row.has_org_id,
        }
        for row in result.fetchall()
    ]
