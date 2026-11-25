from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.soft_delete import ADMIN_RECOVERY_DAYS, USER_RECOVERY_DAYS


class RecoveryItemRead(BaseModel):
    id: UUID
    entity_type: str
    entity_id: UUID
    label: str
    detail: dict[str, Any] = Field(default_factory=dict)
    depends_on: list[str] = Field(default_factory=list)
    batch_id: UUID
    state: str
    deleted_at: datetime
    expires_at: datetime
    purge_at: datetime
    can_restore: bool
    blocked_by: str | None = None

    @staticmethod
    def expiry(deleted_at: datetime, *, admin: bool) -> tuple[datetime, datetime]:
        days = ADMIN_RECOVERY_DAYS if admin else USER_RECOVERY_DAYS
        return deleted_at + timedelta(days=days), deleted_at + timedelta(
            days=ADMIN_RECOVERY_DAYS
        )


class RecoveryList(BaseModel):
    items: list[RecoveryItemRead]
    total: int
    counts: dict[str, int] = Field(default_factory=dict)
    admin: bool = False
