from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TriggerRunRequest(BaseModel):
    scope_month: str | None = Field(
        default=None,
        pattern=r"^\d{4}-\d{2}$",
        description="Optional month to scope the audit, e.g. '2026-05'.",
    )


class AuditRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    status: str
    scope_month: str | None
    triggered_by: UUID | None
    total_findings: int
    created_at: datetime
    completed_at: datetime | None


class AuditFindingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    run_id: UUID
    rule_code: str
    severity: str
    transaction_id: UUID | None
    message: str
    evidence: dict | None
    is_resolved: bool
    resolution_note: str | None
    created_at: datetime
    updated_at: datetime


class ResolveFindingRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)
    resolved: bool = True
