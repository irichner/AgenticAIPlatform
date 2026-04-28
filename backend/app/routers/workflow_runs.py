"""Workflow execution router — stream execution events via SSE."""
from __future__ import annotations
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.auth.dependencies import resolve_org
from app.dependencies import get_db
from app.models.workflow import Workflow
from app.agents.workflow_executor import execute_workflow

router = APIRouter(prefix="/workflow-runs", tags=["workflow-runs"])
logger = logging.getLogger(__name__)


class WorkflowRunRequest(BaseModel):
    workflow_id: str | None = None
    graph: dict | None = None          # {nodes: [...], edges: [...]}
    input_message: str = ""
    simulate: bool = False


@router.post("")
async def start_workflow_run(
    payload: WorkflowRunRequest,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    """
    Start a workflow execution. Accepts either:
    - workflow_id (loads graph from DB)
    - graph inline (nodes + edges)

    Returns a streaming SSE response with execution events.
    """
    # Resolve graph
    if payload.graph:
        graph = payload.graph
    elif payload.workflow_id:
        try:
            wf_id = UUID(payload.workflow_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid workflow_id")
        result = await db.execute(
            select(Workflow).where(Workflow.id == wf_id, Workflow.org_id == org_id)
        )
        wf = result.scalar_one_or_none()
        if wf is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
        graph = wf.graph
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide workflow_id or graph")

    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []

    if not nodes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workflow has no nodes")

    async def event_stream():
        try:
            async for ev_str in execute_workflow(
                nodes=nodes,
                edges=edges,
                input_message=payload.input_message,
                db=db,
                simulate=payload.simulate,
            ):
                yield f"data: {ev_str}\n\n"
        except Exception as exc:
            logger.exception("Workflow run stream error")
            yield f"data: {json.dumps({'type': 'run_error', 'error': str(exc)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
