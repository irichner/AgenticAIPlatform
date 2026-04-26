"""
Lanara Google Drive MCP Server.

Fetches a valid access token from the Lanara backend, then exposes Google Drive
tools over streamable-http transport on port 8024.

Environment variables:
  BACKEND_URL  - Lanara backend base URL (default: http://backend:8000)
  HOST         - bind host (default: 0.0.0.0)
  PORT         - bind port (default: 8024)
"""
import os
import httpx
from mcp.server.fastmcp import FastMCP

_port    = int(os.getenv("PORT", "8024"))
_host    = os.getenv("HOST", "0.0.0.0")
_backend = os.getenv("BACKEND_URL", "http://backend:8000").rstrip("/")

mcp = FastMCP(
    "lanara-gdrive",
    instructions=(
        "You have read access to the user's Google Drive. "
        "Use search_files to find documents by keyword, list_files to browse folders, "
        "and read_file to retrieve file content."
    ),
    host=_host,
    port=_port,
)

_MIME_EXPORT: dict[str, str] = {
    "application/vnd.google-apps.document":     "text/plain",
    "application/vnd.google-apps.spreadsheet":  "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}


def _token() -> str:
    """Fetch a valid access token from the Lanara backend (handles refresh)."""
    resp = httpx.get(f"{_backend}/api/integrations/google-drive/token", timeout=10.0)
    if resp.status_code == 401:
        raise ValueError("Google Drive is not connected. Ask an admin to connect in Settings → MCP Servers.")
    resp.raise_for_status()
    return resp.json()["access_token"]


def _drive_client(token: str) -> httpx.Client:
    return httpx.Client(
        base_url="https://www.googleapis.com",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15.0,
    )


@mcp.tool()
def gdrive_search(query: str, max_results: int = 20) -> dict:
    """
    Search for files in Google Drive by name or content keyword.
    Returns file id, name, MIME type, and web link.
    """
    token = _token()
    params = {
        "q": f"fullText contains '{query}' and trashed = false",
        "fields": "files(id,name,mimeType,webViewLink,modifiedTime)",
        "pageSize": min(max_results, 50),
        "orderBy": "modifiedTime desc",
    }
    with _drive_client(token) as client:
        resp = client.get("/drive/v3/files", params=params)
        resp.raise_for_status()
        files = resp.json().get("files", [])
    return {"query": query, "results": files, "count": len(files)}


@mcp.tool()
def gdrive_list(folder_id: str = "root", max_results: int = 50) -> dict:
    """
    List files and folders inside a Google Drive folder.
    Use folder_id='root' for the root of the drive (default).
    """
    token = _token()
    params = {
        "q": f"'{folder_id}' in parents and trashed = false",
        "fields": "files(id,name,mimeType,webViewLink,modifiedTime,size)",
        "pageSize": min(max_results, 100),
        "orderBy": "folder,name",
    }
    with _drive_client(token) as client:
        resp = client.get("/drive/v3/files", params=params)
        resp.raise_for_status()
        files = resp.json().get("files", [])
    return {"folder_id": folder_id, "files": files, "count": len(files)}


@mcp.tool()
def gdrive_read(file_id: str) -> dict:
    """
    Read the text content of a Google Drive file.
    Google Docs/Sheets/Slides are exported as plain text or CSV.
    Binary files return a size/type notice instead of content.
    """
    token = _token()
    with _drive_client(token) as client:
        meta_resp = client.get(f"/drive/v3/files/{file_id}", params={"fields": "id,name,mimeType,size"})
        meta_resp.raise_for_status()
        meta = meta_resp.json()

        mime = meta.get("mimeType", "")
        name = meta.get("name", file_id)

        export_mime = _MIME_EXPORT.get(mime)
        if export_mime:
            dl = client.get(f"/drive/v3/files/{file_id}/export", params={"mimeType": export_mime})
            dl.raise_for_status()
            content = dl.text[:131072]  # cap at 128 KB
            return {"file_id": file_id, "name": name, "mime_type": mime, "content": content, "truncated": len(dl.text) > 131072}

        size = int(meta.get("size", 0))
        if size > 524288:  # 512 KB
            return {"file_id": file_id, "name": name, "mime_type": mime, "content": None,
                    "note": f"File is {size:,} bytes — too large to read inline. Download directly from Drive."}

        dl = client.get(f"/drive/v3/files/{file_id}", params={"alt": "media"})
        dl.raise_for_status()
        try:
            content = dl.content.decode("utf-8", errors="replace")
        except Exception:
            return {"file_id": file_id, "name": name, "mime_type": mime, "content": None,
                    "note": "Binary file — cannot display as text."}

        return {"file_id": file_id, "name": name, "mime_type": mime, "content": content[:131072],
                "truncated": len(content) > 131072}


@mcp.tool()
def gdrive_file_info(file_id: str) -> dict:
    """Get metadata for a Google Drive file: name, type, size, owner, modified date, sharing link."""
    token = _token()
    params = {"fields": "id,name,mimeType,size,modifiedTime,createdTime,webViewLink,owners,shared"}
    with _drive_client(token) as client:
        resp = client.get(f"/drive/v3/files/{file_id}", params=params)
        resp.raise_for_status()
    return resp.json()


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
