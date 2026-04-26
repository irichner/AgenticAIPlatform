from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db
from app.models.chat import ChatRoom, ChatMessage
from app.models.user import User
from app.schemas.chat import (
    ChatRoomCreate, ChatRoomOut,
    ChatMessageCreate, ChatMessageOut,
    UserCreate, UserOut,
)

router = APIRouter(prefix="/chat", tags=["chat"])


# ── users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.full_name, User.email))
    return result.scalars().all()


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    user = User(email=payload.email, full_name=payload.full_name, role=payload.role)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()


# ── rooms ─────────────────────────────────────────────────────────────────────

@router.get("/rooms", response_model=list[ChatRoomOut])
async def list_rooms(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatRoom).order_by(ChatRoom.name))
    return result.scalars().all()


@router.post("/rooms", response_model=ChatRoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(payload: ChatRoomCreate, db: AsyncSession = Depends(get_db)):
    room = ChatRoom(name=payload.name, type=payload.type)
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room


@router.delete("/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(room_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatRoom).where(ChatRoom.id == room_id))
    room = result.scalar_one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    await db.delete(room)
    await db.commit()


# ── messages ──────────────────────────────────────────────────────────────────

@router.get("/rooms/{room_id}/messages", response_model=list[ChatMessageOut])
async def list_messages(room_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.room_id == room_id)
        .order_by(ChatMessage.created_at)
        .limit(200)
    )
    return result.scalars().all()


@router.post("/rooms/{room_id}/messages", response_model=ChatMessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    room_id: UUID,
    payload: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
):
    msg = ChatMessage(room_id=room_id, sender_name=payload.sender_name, content=payload.content)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg
