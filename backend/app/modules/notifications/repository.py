from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.models import Notification, PushSubscription
from app.shared.exceptions import NotFoundError


class NotificationRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    @staticmethod
    def _visible_to(role: str, user_id: UUID):
        """Visibility filter: direct recipient, role broadcast, or everyone."""
        return or_(
            Notification.recipient_user_id == user_id,
            and_(
                Notification.recipient_user_id.is_(None),
                Notification.recipient_roles.is_(None),
            ),
            and_(
                Notification.recipient_user_id.is_(None),
                Notification.recipient_roles.contains([role]),
            ),
        )

    async def list_for_user(self, user_id: UUID, role: str, limit: int, offset: int):
        stmt = (
            select(Notification)
            .where(
                Notification.tenant_id == self.tenant_id,
                self._visible_to(role, user_id),
            )
            .order_by(Notification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def unread_count(self, user_id: UUID, role: str) -> int:
        stmt = (
            select(func.count(Notification.id))
            .where(
                Notification.tenant_id == self.tenant_id,
                Notification.read_at.is_(None),
                self._visible_to(role, user_id),
            )
        )
        return (await self.session.execute(stmt)).scalar_one()

    async def get_visible(self, notification_id: UUID, user_id: UUID, role: str) -> Notification:
        row = (
            await self.session.execute(
                select(Notification).where(
                    Notification.id == notification_id,
                    Notification.tenant_id == self.tenant_id,
                    self._visible_to(role, user_id),
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError("Notification not found")
        return row

    async def mark_read(self, notification: Notification) -> Notification:
        await self.session.flush()
        await self.session.refresh(notification)
        return notification

    async def mark_all_read(self, user_id: UUID, role: str) -> int:
        result = await self.session.execute(
            Notification.__table__.update()
            .where(
                Notification.tenant_id == self.tenant_id,
                Notification.read_at.is_(None),
                self._visible_to(role, user_id),
            )
            .values(read_at=func.now())
        )
        return result.rowcount or 0

    async def add_subscription(self, subscription: PushSubscription) -> PushSubscription:
        self.session.add(subscription)
        await self.session.flush()
        await self.session.refresh(subscription)
        return subscription

    async def remove_subscription(self, endpoint: str) -> bool:
        result = await self.session.execute(
            delete(PushSubscription).where(
                PushSubscription.tenant_id == self.tenant_id,
                PushSubscription.endpoint == endpoint,
            )
        )
        await self.session.flush()
        return (result.rowcount or 0) > 0