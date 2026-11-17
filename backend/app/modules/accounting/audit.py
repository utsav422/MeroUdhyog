"""Append-only accounting audit trail."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.models import AccountingAuditLog


def json_safe(value):
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple | set):
        return [json_safe(item) for item in value]
    if isinstance(value, Decimal | UUID | date | datetime):
        return str(value)
    return value


async def record(
    session: AsyncSession,
    tenant_id: UUID,
    *,
    entity_type: str,
    entity_id: UUID,
    action: str,
    actor_id: UUID | None = None,
    before: dict | None = None,
    after: dict | None = None,
    reason: str | None = None,
) -> AccountingAuditLog:
    entry = AccountingAuditLog(
        tenant_id=tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_id=actor_id,
        before=json_safe(before) if before is not None else None,
        after=json_safe(after) if after is not None else None,
        reason=reason,
    )
    session.add(entry)
    await session.flush()
    return entry
