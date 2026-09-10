from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.deliveries.models import Delivery, DeliveryLocation
from app.shared.exceptions import NotFoundError


class DeliveryRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def list(
        self,
        limit: int,
        offset: int,
        status: str | None = None,
        agent_id: UUID | None = None,
        route_id: UUID | None = None,
    ) -> list[Delivery]:
        stmt = select(Delivery).where(Delivery.tenant_id == self.tenant_id)
        if status:
            stmt = stmt.where(Delivery.status == status)
        if agent_id:
            stmt = stmt.where(Delivery.delivery_agent_id == agent_id)
        if route_id is not None:
            stmt = stmt.where(Delivery.route_id == route_id)
        stmt = stmt.order_by(Delivery.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_many(self, delivery_ids: list[UUID]) -> list[Delivery]:
        if not delivery_ids:
            return []
        result = await self.session.execute(
            select(Delivery).where(
                Delivery.id.in_(delivery_ids),
                Delivery.tenant_id == self.tenant_id,
            )
        )
        return list(result.scalars().all())

    async def get(self, delivery_id: UUID) -> Delivery:
        result = await self.session.execute(
            select(Delivery).where(
                Delivery.id == delivery_id,
                Delivery.tenant_id == self.tenant_id,
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            raise NotFoundError("Delivery not found")
        return row

    async def get_by_order_id(self, order_id: UUID) -> Delivery | None:
        result = await self.session.execute(
            select(Delivery).where(
                Delivery.tenant_id == self.tenant_id,
                Delivery.order_id == order_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(self, delivery: Delivery) -> Delivery:
        self.session.add(delivery)
        await self.session.flush()
        await self.session.refresh(delivery)
        return delivery

    async def update(self, delivery: Delivery) -> Delivery:
        await self.session.flush()
        await self.session.refresh(delivery)
        return delivery

    async def add_location(self, location: DeliveryLocation) -> DeliveryLocation:
        self.session.add(location)
        await self.session.flush()
        await self.session.refresh(location)
        return location

    async def list_locations(self, delivery_id: UUID) -> list[DeliveryLocation]:
        result = await self.session.execute(
            select(DeliveryLocation)
            .where(DeliveryLocation.delivery_id == delivery_id)
            .order_by(DeliveryLocation.recorded_at)
        )
        return list(result.scalars().all())
