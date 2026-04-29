from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ScheduleCreate(BaseModel):
    agent_id: UUID
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None

    schedule_type: Literal["cron", "interval", "once"]
    cron_expression: str | None = None
    interval_seconds: int | None = Field(default=None, gt=0)
    run_at: datetime | None = None
    timezone: str = "UTC"

    input_override: dict[str, Any] | None = None
    enabled: bool = True
    max_retries: int = Field(default=0, ge=0, le=10)
    retry_delay_seconds: int = Field(default=60, ge=0)
    timeout_seconds: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_schedule_fields(self) -> "ScheduleCreate":
        if self.schedule_type == "cron" and not self.cron_expression:
            raise ValueError("cron_expression is required for schedule_type='cron'")
        if self.schedule_type == "interval" and not self.interval_seconds:
            raise ValueError("interval_seconds is required for schedule_type='interval'")
        if self.schedule_type == "once" and not self.run_at:
            raise ValueError("run_at is required for schedule_type='once'")
        return self


class ScheduleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    cron_expression: str | None = None
    interval_seconds: int | None = Field(default=None, gt=0)
    run_at: datetime | None = None
    timezone: str | None = None
    input_override: dict[str, Any] | None = None
    enabled: bool | None = None
    max_retries: int | None = Field(default=None, ge=0, le=10)
    retry_delay_seconds: int | None = Field(default=None, ge=0)
    timeout_seconds: int | None = Field(default=None, gt=0)


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    agent_id: UUID
    created_by: UUID | None
    name: str
    description: str | None
    schedule_type: str
    cron_expression: str | None
    interval_seconds: int | None
    run_at: datetime | None
    timezone: str
    input_override: dict[str, Any] | None
    enabled: bool
    max_retries: int
    retry_delay_seconds: int
    timeout_seconds: int | None
    next_run_at: datetime | None
    last_run_at: datetime | None
    last_run_status: str | None
    last_run_id: UUID | None
    run_count: int
    failure_count: int
    created_at: datetime
    updated_at: datetime
