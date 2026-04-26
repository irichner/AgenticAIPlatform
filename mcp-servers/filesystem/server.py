"""
Lanara Filesystem MCP Server.

Exposes read-only file access to an ALLOWED_DIR mount (default: /files).
Set ALLOWED_DIR env var to change the root; mount host paths via Docker volume.
Runs on port 8023 with streamable-http transport.
"""
import fnmatch
import os
from datetime import datetime
from mcp.server.fastmcp import FastMCP

_port = int(os.getenv("PORT", "8023"))
_host = os.getenv("HOST", "0.0.0.0")
_allowed = os.path.realpath(os.getenv("ALLOWED_DIR", "/files"))

mcp = FastMCP(
    "lanara-filesystem",
    instructions=(
        "You have read access to files under the configured directory. "
        "Use list_directory to explore, read_file to retrieve content, "
        "search_files to find files by name pattern, and get_file_info for metadata."
    ),
    host=_host,
    port=_port,
)

MAX_READ_BYTES = 512 * 1024  # 512 KB safety cap


def _safe_path(rel: str) -> str:
    """Resolve rel path under _allowed; raise if it escapes."""
    full = os.path.realpath(os.path.join(_allowed, rel.lstrip("/")))
    if not full.startswith(_allowed):
        raise ValueError(f"Path '{rel}' is outside the allowed directory.")
    return full


@mcp.tool()
def list_directory(path: str = "") -> dict:
    """List files and subdirectories at path (relative to the allowed root)."""
    full = _safe_path(path)
    if not os.path.isdir(full):
        raise ValueError(f"'{path}' is not a directory.")

    dirs, files = [], []
    for entry in sorted(os.scandir(full), key=lambda e: e.name.lower()):
        try:
            if entry.is_dir():
                dirs.append(entry.name + "/")
            else:
                size = entry.stat(follow_symlinks=False).st_size
                files.append({"name": entry.name, "size_bytes": size})
        except OSError:
            # Skip broken symlinks or permission-denied entries
            pass

    return {
        "path": path or "/",
        "directories": dirs,
        "files": files,
        "total_entries": len(dirs) + len(files),
    }


@mcp.tool()
def read_file(path: str) -> dict:
    """Read the contents of a file (up to 512 KB). Returns text content and metadata."""
    full = _safe_path(path)
    if not os.path.isfile(full):
        raise ValueError(f"'{path}' is not a file.")

    size = os.path.getsize(full)
    if size > MAX_READ_BYTES:
        raise ValueError(
            f"File is {size:,} bytes — exceeds the {MAX_READ_BYTES:,}-byte read limit. "
            "Use search_files to locate a specific section or split the file."
        )

    try:
        with open(full, encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError as e:
        raise ValueError(f"Could not read '{path}': {e}") from e

    return {
        "path": path,
        "size_bytes": size,
        "content": content,
    }


@mcp.tool()
def search_files(pattern: str, path: str = "") -> dict:
    """
    Search for files whose names match a glob pattern (e.g. '*.csv', 'quota_*').
    Searches recursively under path (defaults to root). Returns up to 100 matches.
    """
    root = _safe_path(path)
    matches = []
    for dirpath, _, filenames in os.walk(root, followlinks=False):
        try:
            real_dir = os.path.realpath(dirpath)
        except OSError:
            continue
        if not real_dir.startswith(_allowed):
            continue
        for name in filenames:
            if fnmatch.fnmatch(name.lower(), pattern.lower()):
                rel = os.path.relpath(os.path.join(dirpath, name), _allowed)
                matches.append(rel.replace("\\", "/"))
                if len(matches) >= 100:
                    return {"pattern": pattern, "matches": matches, "truncated": True}

    return {"pattern": pattern, "matches": sorted(matches), "truncated": False}


@mcp.tool()
def get_file_info(path: str) -> dict:
    """Get metadata for a file or directory: size, type, last modified."""
    full = _safe_path(path)
    if not os.path.exists(full):
        raise ValueError(f"'{path}' does not exist.")

    stat = os.stat(full)
    return {
        "path": path,
        "type": "directory" if os.path.isdir(full) else "file",
        "size_bytes": stat.st_size,
        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "allowed_root": _allowed,
    }


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
