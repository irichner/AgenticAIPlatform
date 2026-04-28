from __future__ import annotations
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, Boolean, Integer, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship


from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.api_provider import ApiProvider


class AiModel(Base, TimestampMixin):
    __tablename__ = "ai_models"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("orgs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False, server_default="api")
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    model_id: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("TRUE"))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Managed provider relationship
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("api_providers.id", ondelete="CASCADE"),
        nullable=True,
    )
    context_window: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capabilities: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    is_auto_managed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("FALSE")
    )

    provider_rel: Mapped["ApiProvider | None"] = relationship(
        "ApiProvider", back_populates="models"
    )
