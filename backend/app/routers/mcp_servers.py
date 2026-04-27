from __future__ import annotations
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.models.mcp_server import McpServer
from app.models.mcp_tool import McpTool
from app.schemas.mcp_server import (
    McpServerCreate,
    McpServerOut,
    McpServerUpdate,
    McpToolOut,
    McpToolUpdate,
    ImportOpenApiRequest,
)

router = APIRouter(prefix="/mcp-servers", tags=["mcp-servers"])


def _with_tools():
    return selectinload(McpServer.tools)


@router.get("", response_model=list[McpServerOut])
async def list_mcp_servers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(McpServer).options(_with_tools()).order_by(McpServer.name)
    )
    return result.scalars().all()


@router.post("", response_model=McpServerOut, status_code=status.HTTP_201_CREATED)
async def create_mcp_server(payload: McpServerCreate, db: AsyncSession = Depends(get_db)):
    server = McpServer(**payload.model_dump())
    db.add(server)
    await db.commit()
    await db.refresh(server)
    await db.refresh(server, ["tools"])
    return server


@router.post("/import-openapi", response_model=McpServerOut, status_code=status.HTTP_201_CREATED)
async def import_openapi_spec(payload: ImportOpenApiRequest, db: AsyncSession = Depends(get_db)):
    from app.services.openapi_importer import import_openapi
    try:
        server = await import_openapi(
            db=db,
            name=payload.name,
            base_url=payload.base_url,
            spec_url=payload.spec_url,
            spec_json=payload.spec_json,
            description=payload.description,
            auth_config=payload.auth_config,
            slug=payload.slug,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch or parse spec: {exc}",
        )
    return server


@router.patch("/{server_id}", response_model=McpServerOut)
async def update_mcp_server(
    server_id: UUID, payload: McpServerUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(McpServer).options(_with_tools()).where(McpServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP server not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(server, field, value)
    await db.commit()
    await db.refresh(server)
    await db.refresh(server, ["tools"])
    return server


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mcp_server(server_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(McpServer).where(McpServer.id == server_id))
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP server not found")
    await db.delete(server)
    await db.commit()


# ── Code generation (Phase 2) ─────────────────────────────────────────────────

@router.post("/{server_id}/export", status_code=status.HTTP_200_OK)
async def export_server_code(server_id: UUID, db: AsyncSession = Depends(get_db)):
    """Generate and return a downloadable zip of a stand-alone Python MCP project."""
    result = await db.execute(
        select(McpServer).options(_with_tools()).where(McpServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP server not found")
    if server.runtime_mode != "dynamic":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only dynamic servers can be exported to code.",
        )

    from app.services.codegen import generate_project_zip
    zip_bytes = generate_project_zip(server)

    # Record generation timestamp
    server.last_generated_at = datetime.now(timezone.utc)
    await db.commit()

    filename = f"mcp-{server.slug or server_id}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Tool sub-resources ────────────────────────────────────────────────────────

@router.get("/{server_id}/tools", response_model=list[McpToolOut])
async def list_tools(server_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(McpTool).where(McpTool.server_id == server_id).order_by(McpTool.name)
    )
    return result.scalars().all()


@router.patch("/{server_id}/tools/{tool_id}", response_model=McpToolOut)
async def update_tool(
    server_id: UUID, tool_id: UUID, payload: McpToolUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(McpTool).where(McpTool.id == tool_id, McpTool.server_id == server_id)
    )
    tool = result.scalar_one_or_none()
    if tool is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(tool, field, value)
    await db.commit()
    await db.refresh(tool)
    return tool
