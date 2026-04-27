from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Any


class WorkflowCreate(BaseModel):
    name: str = "Untitled Workflow"
    graph: dict[str, Any] = {"nodes": [], "edges": []}


class WorkflowUpdate(BaseModel):
    name: str | None = None
    graph: dict[str, Any] | None = None
    bpmn_xml: str | None = None


class WorkflowVersionCreate(BaseModel):
    note: str | None = None


class WorkflowVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workflow_id: UUID
    version: int
    name: str
    graph: dict[str, Any]
    bpmn_xml: str | None
    note: str | None
    created_at: datetime


class WorkflowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    graph: dict[str, Any]
    bpmn_xml: str | None
    version: int
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class WorkflowListItem(BaseModel):
    """Lightweight summary for listing — no graph payload."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    version: int
    created_at: datetime
    updated_at: datetime
