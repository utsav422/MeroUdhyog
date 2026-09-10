from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.orders.models import Order, OrderItem
from app.shared.exceptions import NotFoundError


class OrderRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def list(
        self,
        limit: int,
        offset: int,
        status: str | None = None,
        customer_id: UUID | None = None,
        route_id: UUID | None = None,
    ) -> list[Order]:
        stmt = (
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.route))
            .where(Order.tenant_id == self.tenant_id)
        )
        if status:
            stmt = stmt.where(Order.status == status)
        if customer_id is not None:
            stmt = stmt.where(Order.customer_id == customer_id)
        if route_id is not None:
            stmt = stmt.where(Order.route_id == route_id)
        stmt = stmt.order_by(Order.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all())

    async def get(self, order_id: UUID) -> Order:
        result = await self.session.execute(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.route))
            .where(Order.id == order_id, Order.tenant_id == self.tenant_id)
        )
        row = result.scalars().unique().one_or_none()
        if not row:
            raise NotFoundError("Order not found")
        return row

    async def get_many(self, order_ids: list[UUID]) -> list[Order]:
        if not order_ids:
            return []
        result = await self.session.execute(
            select(Order).where(
                Order.id.in_(order_ids), Order.tenant_id == self.tenant_id
            )
        )
        return list(result.scalars().unique().all())

    async def create(self, order: Order, items: list[OrderItem]) -> Order:
        self.session.add(order)
        await self.session.flush()
        for item in items:
            item.order_id = order.id
            item.tenant_id = self.tenant_id
            self.session.add(item)
        await self.session.flush()
        return await self.get(order.id)

    async def update(self, order: Order) -> Order:
        await self.session.flush()
        await self.session.refresh(order)
        return await self.get(order.id)

    async def delete(self, order: Order) -> None:
        await self.session.delete(order)
        await self.session.flush()

    async def next_order_ref(self) -> str:
        result = await self.session.execute(
            select(Order.order_ref)
            .where(Order.tenant_id == self.tenant_id)
            .order_by(Order.created_at.desc())
            .limit(1)
        )
        last = result.scalar_one_or_none()
        if last and last.startswith("ORD-"):
            try:
                num = int(last[4:], 16) + 1
            except ValueError:
                num = 1
        else:
            num = 1
        return f"ORD-{num:08X}"
