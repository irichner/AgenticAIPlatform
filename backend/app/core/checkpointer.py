from __future__ import annotations
import os
import re

_checkpointer = None


def _get_sync_dsn() -> str:
    """Convert asyncpg DATABASE_URL to psycopg3 DSN for LangGraph checkpointer."""
    url = os.getenv("DATABASE_URL", "postgresql+asyncpg://lanara:lanara_supersecret@postgres:5432/lanara")
    # Strip SQLAlchemy driver prefix → plain postgresql:// URL for psycopg3
    dsn = re.sub(r"^\w+\+\w+://", "postgresql://", url)
    return dsn


async def get_checkpointer():
    """
    Return the module-level AsyncPostgresSaver instance.
    setup() creates the LangGraph checkpoint tables on first call.
    Subsequent calls return the cached instance.
    """
    global _checkpointer
    if _checkpointer is not None:
        return _checkpointer

    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        dsn = _get_sync_dsn()
        _checkpointer = AsyncPostgresSaver.from_conn_string(dsn)
        await _checkpointer.setup()
    except Exception as e:
        # Checkpointer unavailable (missing package, DB issue) — HIL won't work
        # but the rest of the app continues normally.
        print(f"[checkpointer] WARNING: could not initialise AsyncPostgresSaver: {e}")
        _checkpointer = None

    return _checkpointer
