"""Commission Engine models.

commission_plans: plan definitions (tiers, accelerators, clawback rules)
quota_allocations: quota by rep / period / BU
attainment_snapshots: daily attainment snapshots for time-series
"""
from __future__ import annotations
import uuid
from datetime import date
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, Numeric, ForeignKey, Boolean, Date, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from app.models.base import Base, TimestampMixin


class CommissionPlan(Base, TimestampMixin):
    __tablename__ = "commission_plans"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan_year: Mapped[int] = mapped_column(Integer, nullable=False)
    plan_type: Mapped[str] = mapped_column(String(50), nullable=False)  # straight, tiered, accelerated, draw
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    # Full plan logic as JSON:
    # {
    #   "quota_type": "arr",          # arr, revenue, units, activity
    #   "base_rate": 0.10,            # 10% commission on quota attainment up to 100%
    #   "currency": "USD",
    #   "clawback_days": 90,          # clawback window
    #   "draw_amount": 5000,          # monthly draw (recoverable)
    #   "tiers": [
    #     {"from_pct": 0,   "to_pct": 100, "rate": 0.10},
    #     {"from_pct": 100, "to_pct": 125, "rate": 0.12},
    #     {"from_pct": 125, "to_pct": null, "rate": 0.15},
    #   ],
    #   "spif_rules": [...],
    # }
    definition: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="'{}'")


class QuotaAllocation(Base, TimestampMixin):
    __tablename__ = "quota_allocations"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.users.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("commission_plans.id", ondelete="SET NULL"), nullable=True
    )
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None = annual
    quota_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    quota_type: Mapped[str] = mapped_column(String(50), nullable=False, server_default="'arr'")


class AttainmentSnapshot(Base, TimestampMixin):
    __tablename__ = "attainment_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.users.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    attainment_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    attainment_pct: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False)
    commission_earned: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, server_default="0")
