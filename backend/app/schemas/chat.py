from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class ChatRoomCreate(BaseModel):
    name: str
    type: str = "group"


class ChatRoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    type: str
    created_at: datetime
    updated_at: datetime


class ChatMessageCreate(BaseModel):
    sender_name: str
    content: str


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    room_id: UUID
    sender_name: str
    content: str
    created_at: datetime


class UserCreate(BaseModel):
    email: str
    full_name: str | None = None
    role: str = "member"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    full_name: str | None
    role: str
    created_at: datetime
