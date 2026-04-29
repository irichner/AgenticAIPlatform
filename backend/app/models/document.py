from __future__ import annotations
import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from pgvector.sqlalchemy import Vector
from app.models.base import Base, TimestampMixin


class Document(Base, TimestampMixin):
    __tablename__ = "documents"
    __table_args__ = {"schema": "lanara"}

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    business_unit_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("lanara.business_units.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, server_default="processing")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = {"schema": "lanara"}

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    document_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("lanara.documents.id", ondelete="CASCADE"), nullable=False, index=True)
    business_unit_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("lanara.business_units.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
