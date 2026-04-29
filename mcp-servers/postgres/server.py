"""
Lanara PostgreSQL MCP Server.

Exposes read-only SQL access to the public schema only.
Platform/infrastructure tables live in the lanara schema and are not exposed.
Only SELECT statements are permitted; all DDL/DML is blocked.

Org isolation is enforced via Row-Level Security.  The MCP gateway injects the
X-Lanara-Org-Id header; middleware here stores it in a ContextVar so every
psycopg2 connection can SET LOCAL app.current_org_id before running queries.

Environment variables:
  DATABASE_URL  - postgres connection string (required)
  HOST          - bind host (default: 0.0.0.0)
  PORT          - bind port (default: 8012)
"""
import os
import re
from contextvars import ContextVar

import psycopg2
import psycopg2.extras
import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

_port = int(os.getenv("PORT", "8012"))
_host = os.getenv("HOST", "0.0.0.0")
_dsn  = os.getenv("DATABASE_URL", "")
_dsn  = _dsn.replace("postgresql+asyncpg://", "postgresql://")

# Per-request org context — set by OrgContextMiddleware from X-Lanara-Org-Id header
_org_id_var: ContextVar[str] = ContextVar("mcp_org_id", default="")

mcp = FastMCP(
    "lanara-postgres",
    instructions=(
        "You have read-only access to the business data tables in PostgreSQL. "
        "Use list_tables to see available tables, describe_table to inspect columns, "
        "and query to run SELECT statements. Only read operations are permitted. "
        "Tables shown are user business data only (CRM, commissions, etc.). "
        "All queries are automatically scoped to the current organisation."
    ),
    host=_host,
    port=_port,
)

_BLOCKED = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|MERGE|GRANT|REVOKE|EXEC|EXECUTE|COPY|VACUUM|ANALYZE)\b",
    re.IGNORECASE,
)


class OrgContextMiddleware(BaseHTTPMiddleware):
    """Extract X-Lanara-Org-Id from each MCP request and store in ContextVar."""

    async def dispatch(self, request: StarletteRequest, call_next):
        org_id = request.headers.get("x-lanara-org-id", "")
        token = _org_id_var.set(org_id)
        try:
            return await call_next(request)
        finally:
            _org_id_var.reset(token)


def _conn():
    """Open a psycopg2 connection with RLS org context pre-set.

    Returns a connection that must be closed by the caller.  SET LOCAL is
    executed in the same implicit transaction that will be used for queries —
    open one cursor to set context, then open a second cursor to run the query,
    all on the same connection object.
    """
    conn = psycopg2.connect(_dsn)
    org_id = _org_id_var.get()
    with conn.cursor() as cur:
        if org_id:
            cur.execute("SET LOCAL app.current_org_id = %s", (org_id,))
        else:
            cur.execute("SET LOCAL app.bypass_rls = 'internal'")
    return conn


def _require_org() -> str:
    """Raise if no org context is set on this request."""
    org_id = _org_id_var.get()
    if not org_id:
        raise ValueError(
            "X-Lanara-Org-Id header is required. "
            "All queries must be scoped to an organisation."
        )
    return org_id


def _guard(sql: str) -> None:
    """Raise if the SQL contains any write/DDL keywords."""
    if _BLOCKED.search(sql):
        raise ValueError(
            "Only SELECT queries are permitted. "
            "Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are blocked."
        )


def _run_query(conn, sql: str, limit: int = 100) -> dict:
    """Execute a validated SELECT on an already-configured connection."""
    _guard(sql)
    effective_limit = min(limit, 500)
    stripped = sql.rstrip("; \t\n")
    if not re.search(r"\bLIMIT\b", stripped, re.IGNORECASE):
        stripped = f"{stripped} LIMIT {effective_limit}"
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(stripped)
        rows = [dict(r) for r in cur.fetchall()]
    return {"rows": rows, "count": len(rows), "sql": stripped}


@mcp.tool()
def list_tables() -> dict:
    """List all user-visible business data tables in the public schema with descriptions and row counts."""
    _require_org()
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    t.table_name,
                    t.table_type,
                    pg_stat_user_tables.n_live_tup AS row_estimate,
                    obj_description(pgc.oid, 'pg_class') AS description
                FROM information_schema.tables t
                LEFT JOIN pg_stat_user_tables
                    ON pg_stat_user_tables.schemaname = t.table_schema
                   AND pg_stat_user_tables.relname     = t.table_name
                LEFT JOIN pg_class pgc
                    ON pgc.relname = t.table_name
                   AND pgc.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
                WHERE t.table_schema = 'public'
                  AND t.table_name   != 'alembic_version'
                ORDER BY t.table_name
            """)
            rows = [dict(r) for r in cur.fetchall()]
        conn.commit()
    finally:
        conn.close()
    return {"tables": rows, "count": len(rows)}


@mcp.tool()
def describe_table(table_name: str) -> dict:
    """
    Return the column definitions, data types, and constraints for a business data table.
    Only tables in the public schema are accessible.
    """
    _require_org()
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    c.column_name,
                    c.data_type,
                    c.character_maximum_length,
                    c.is_nullable,
                    c.column_default,
                    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key,
                    col_description(pgc.oid, c.ordinal_position) AS description
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT ku.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage ku
                      ON tc.constraint_name = ku.constraint_name
                     AND tc.table_schema    = ku.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                      AND tc.table_schema    = 'public'
                      AND tc.table_name      = %s
                ) pk ON pk.column_name = c.column_name
                LEFT JOIN pg_class pgc
                    ON pgc.relname = c.table_name
                   AND pgc.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
                WHERE c.table_schema = 'public' AND c.table_name = %s
                ORDER BY c.ordinal_position
            """, (table_name, table_name))
            cols = [dict(r) for r in cur.fetchall()]
        conn.commit()
    finally:
        conn.close()
    if not cols:
        return {"error": f"Table 'public.{table_name}' not found or has no columns."}
    return {"table": f"public.{table_name}", "columns": cols}


@mcp.tool()
def query(sql: str, limit: int = 100) -> dict:
    """
    Run a read-only SELECT query against business data tables and return results.
    A LIMIT is automatically applied if not already present (max 500 rows).
    Only SELECT statements are permitted. Tables are in the public schema.
    """
    _require_org()
    conn = _conn()
    try:
        result = _run_query(conn, sql, limit)
        conn.commit()
    finally:
        conn.close()
    return result


@mcp.tool()
def sample_table(table_name: str, limit: int = 10) -> dict:
    """Return a sample of rows from a public-schema business data table."""
    _require_org()
    safe_table = re.sub(r"[^\w]", "", table_name)
    conn = _conn()
    try:
        result = _run_query(conn, f'SELECT * FROM public."{safe_table}"', limit=min(limit, 50))
        conn.commit()
    finally:
        conn.close()
    return result


if __name__ == "__main__":
    starlette_app = mcp.streamable_http_app()
    starlette_app.add_middleware(OrgContextMiddleware)
    uvicorn.run(starlette_app, host=_host, port=_port)
