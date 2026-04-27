from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class ApiProviderConnect(BaseModel):
    name: str
    api_key: str
    base_url: str | None = None


class ApiProviderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    display_name: str
    api_key_set: bool
    base_url: str | None
    status: str
    last_synced_at: datetime | None
    model_count: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_mask(cls, obj: object, model_count: int = 0) -> "ApiProviderOut":
        return cls(
            id=obj.id,  # type: ignore[attr-defined]
            name=obj.name,  # type: ignore[attr-defined]
            display_name=obj.display_name,  # type: ignore[attr-defined]
            api_key_set=bool(obj.api_key),  # type: ignore[attr-defined]
            base_url=obj.base_url,  # type: ignore[attr-defined]
            status=obj.status,  # type: ignore[attr-defined]
            last_synced_at=obj.last_synced_at,  # type: ignore[attr-defined]
            model_count=model_count,
            created_at=obj.created_at,  # type: ignore[attr-defined]
            updated_at=obj.updated_at,  # type: ignore[attr-defined]
        )
