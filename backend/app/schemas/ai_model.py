from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class AiModelCreate(BaseModel):
    name: str
    type: str = "local"
    provider: str
    model_id: str
    base_url: str | None = None
    api_key: str | None = None
    enabled: bool = True
    description: str | None = None


class AiModelUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    provider: str | None = None
    model_id: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    enabled: bool | None = None
    description: str | None = None


class AiModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    type: str
    provider: str
    model_id: str
    base_url: str | None
    api_key_set: bool
    enabled: bool
    description: str | None
    provider_id: UUID | None
    context_window: int | None
    capabilities: list[str] | None
    is_auto_managed: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_mask(cls, obj: object) -> "AiModelOut":
        return cls(
            id=obj.id,  # type: ignore[attr-defined]
            name=obj.name,  # type: ignore[attr-defined]
            type=obj.type,  # type: ignore[attr-defined]
            provider=obj.provider,  # type: ignore[attr-defined]
            model_id=obj.model_id,  # type: ignore[attr-defined]
            base_url=obj.base_url,  # type: ignore[attr-defined]
            api_key_set=bool(obj.api_key),  # type: ignore[attr-defined]
            enabled=obj.enabled,  # type: ignore[attr-defined]
            description=obj.description,  # type: ignore[attr-defined]
            provider_id=obj.provider_id,  # type: ignore[attr-defined]
            context_window=obj.context_window,  # type: ignore[attr-defined]
            capabilities=obj.capabilities,  # type: ignore[attr-defined]
            is_auto_managed=obj.is_auto_managed,  # type: ignore[attr-defined]
            created_at=obj.created_at,  # type: ignore[attr-defined]
            updated_at=obj.updated_at,  # type: ignore[attr-defined]
        )
