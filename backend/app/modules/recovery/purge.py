"""Retention cleanup for the Recovery page.

Trashed rows stay visible to regular users for two days and to the backend
admin for seven. This job permanently removes anything past the admin window;
it is safe to run repeatedly and from more than one process.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.soft_delete import ADMIN_RECOVERY_DAYS
from app.modules.recovery.models import RecoveryItem
from app.modules.recovery.service import RecoveryService


async def purge_expired(
    session: AsyncSession,
    *,
    tenant_id: UUID | None = None,
    now: datetime | None = None,
    limit: int = 200,
    retention_days: int | None = None,
) -> int:
    settings = get_settings()
    days = retention_days if retention_days is not None else settings.RECOVERY_ADMIN_DAYS
    if days < ADMIN_RECOVERY_DAYS:
        days = ADMIN_RECOVERY_DAYS
    cutoff = (now or datetime.now(UTC)) - timedelta(days=days)
    stmt = (
        select(RecoveryItem.tenant_id, RecoveryItem.id)
        .where(RecoveryItem.state == "trashed", RecoveryItem.deleted_at < cutoff)
        .order_by(RecoveryItem.deleted_at.asc())
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    if tenant_id is not None:
        stmt = stmt.where(RecoveryItem.tenant_id == tenant_id)
    rows = (await session.execute(stmt)).all()
    purged = 0
    for row_tenant_id, item_id in rows:
        service = RecoveryService(session, row_tenant_id, admin_override=True)
        try:
            async with session.begin_nested():
                await service.permanently_delete(item_id)
            purged += 1
        except Exception:
            continue
    await session.flush()
    return purged
