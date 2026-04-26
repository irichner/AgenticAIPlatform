from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_unit_id: UUID
    filename: str
    content_type: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class SearchRequest(BaseModel):
    query: str
    business_unit_id: UUID
    top_k: int = 5


class SearchResult(BaseModel):
    content: str
    similarity: float
    document_id: UUID | None = None
