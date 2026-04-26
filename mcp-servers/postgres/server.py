"""
Lanara PostgreSQL MCP Server.

Exposes read-only SQL access to a PostgreSQL database via MCP tools.
Only SELECT statements are permitted; all DDL/DML is blocked.

Environment variables:
  DATABASE_URL  - postgres connection string (required)
  HOST          - bind host (default: 0.0.0.0)
  PORT          - bind port (default: 8012)
"""
import os
import re
import psycopg2
import psycopg2.extras
from mcp.server.fastmcp import FastMCP

_port = int(os.getenv("PORT", "8012"))
_host = os.getenv("HOST", "0.0.0.0")
_dsn  = os.getenv("DATABASE_URL", "")

# Convert asyncpg URL format to psycopg2 format if needed
_dsn = _dsn.replace("postgresql+asyncpg://", "postgresql://")

mcp = FastMCP(
    "lanara-postgres",
    instructions=(
        "You have read-only access to a PostgreSQL database. "
        "Use list_tables to see available tables, describe_table to inspect columns, "
        "and query to run SELECT statements. Only read operations are permitted."
    ),
    host=_host,
    port=_port,
)

_BLOCKED = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|MERGE|GRANT|REVOKE|EXEC|EXECUTE|COPY|VACUUM|ANALYZE)\b",
    re.IGNORECASE,
)


def _conn():
    return psycopg2.connect(_dsn)


def _guard(sql: str) -> None:
    """Raise if the SQL contains any write/DDL keywords."""
    if _BLOCKED.search(sql):
        raise ValueError(
            "Only SELECT queries are permitted. "
            "Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are blocked."
        )


@mcp.tool()
def list_tables() -> dict:
    """List all user-visible tables and views in the database with their row counts."""
    with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT
                t.table_schema,
                t.table_name,
                t.table_type,
                pg_stat_user_tables.n_live_tup AS row_estimate
            FROM information_schema.tables t
            LEFT JOIN pg_stat_user_tables
                ON pg_stat_user_tables.schemaname = t.table_schema
               AND pg_stat_user_tables.relname     = t.table_name
            WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY t.table_schema, t.table_name
        """)
        rows = [dict(r) for r in cur.fetchall()]
    return {"tables": rows, "count": len(rows)}


@mcp.tool()
def describe_table(table_name: str, schema: str = "public") -> dict:
    """
    Return the column definitions, data types, and constraints for a table.
    Use schema='public' unless the table is in another schema.
    """
    with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT
                c.column_name,
                c.data_type,
                c.character_maximum_length,
                c.is_nullable,
                c.column_default,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT ku.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku
                  ON tc.constraint_name = ku.constraint_name
                 AND tc.table_schema    = ku.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_schema    = %s
                  AND tc.table_name      = %s
            ) pk ON pk.column_name = c.column_name
            WHERE c.table_schema = %s AND c.table_name = %s
            ORDER BY c.ordinal_position
        """, (schema, table_name, schema, table_name))
        cols = [dict(r) for r in cur.fetchall()]
    if not cols:
        return {"error": f"Table '{schema}.{table_name}' not found or has no columns."}
    return {"table": f"{schema}.{table_name}", "columns": cols}


@mcp.tool()
def query(sql: str, limit: int = 100) -> dict:
    """
    Run a read-only SELECT query and return results as a list of rows.
    A LIMIT is automatically applied if not already present (max 500 rows).
    Only SELECT statements are permitted.
    """
    _guard(sql)
    effective_limit = min(limit, 500)
    # Inject LIMIT if not present
    stripped = sql.rstrip("; \t\n")
    if not re.search(r"\bLIMIT\b", stripped, re.IGNORECASE):
        stripped = f"{stripped} LIMIT {effective_limit}"

    with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(stripped)
        rows = [dict(r) for r in cur.fetchall()]
    return {"rows": rows, "count": len(rows), "sql": stripped}


@mcp.tool()
def sample_table(table_name: str, schema: str = "public", limit: int = 10) -> dict:
    """Return a sample of rows from a table to understand its contents."""
    safe_table  = re.sub(r"[^\w]", "", table_name)
    safe_schema = re.sub(r"[^\w]", "", schema)
    return query(f'SELECT * FROM "{safe_schema}"."{safe_table}"', limit=min(limit, 50))


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
