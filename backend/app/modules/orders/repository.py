from __future__ import annotations

from datetime import UTC, date, datetime, time
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.customers.models import Customer
from app.modules.deliveries.models import Delivery
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
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        delivered_from: date | None = None,
        delivered_to: date | None = None,
        search: str | None = None,
        source: str | None = None,
        payment_status: str | None = None,
        status_scope: str | None = None,
    ) -> list[Order]:
        """Tenant-scoped list with the filters used by the orders tables.

        ``status_scope`` separates the delivered and pending/undelivered pages
        without consuming the more specific ``status`` filter. Date bounds are
        inclusive whole UTC days, matching the rest of the API's date filters.
        """
        stmt = (
            select(Order)
            .options(
                selectinload(Order.items),
                selectinload(Order.route),
                selectinload(Order.reorder_of),
            )
            .where(Order.tenant_id == self.tenant_id)
        )
        if status:
            stmt = stmt.where(Order.status == status)
        if customer_id is not None:
            stmt = stmt.where(Order.customer_id == customer_id)
        if route_id is not None:
            stmt = stmt.where(Order.route_id == route_id)
        if status_scope == "delivered":
            stmt = stmt.where(Order.status == "delivered")
        elif status_scope == "undelivered":
            stmt = stmt.where(Order.status != "delivered")
        if source:
            stmt = stmt.where(Order.source == source)
        if payment_status:
            stmt = stmt.where(Order.payment_status == payment_status)
        if date_from:
            stmt = stmt.where(
                Order.created_at >= datetime.combine(date_from, time.min, tzinfo=UTC)
            )
        if date_to:
            stmt = stmt.where(Order.created_at <= datetime.combine(date_to, time.max, tzinfo=UTC))
        if delivered_from or delivered_to:
            stmt = stmt.join(
                Delivery,
                (Delivery.order_id == Order.id) & (Delivery.tenant_id == self.tenant_id),
            )
            if delivered_from:
                stmt = stmt.where(
                    Delivery.delivered_at >= datetime.combine(delivered_from, time.min, tzinfo=UTC)
                )
            if delivered_to:
                stmt = stmt.where(
                    Delivery.delivered_at <= datetime.combine(delivered_to, time.max, tzinfo=UTC)
                )
        needle = (search or "").strip()
        if needle:
            stmt = stmt.join(
                Customer,
                (Order.customer_id == Customer.id) & (Customer.tenant_id == self.tenant_id),
                isouter=True,
            ).where(
                or_(
                    Order.order_ref.ilike(f"%{needle}%"),
                    Customer.name.ilike(f"%{needle}%"),
                    Customer.phone.ilike(f"%{needle}%"),
                    Order.notes.ilike(f"%{needle}%"),
                )
            )
        stmt = stmt.order_by(Order.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all())

    async def get(self, order_id: UUID) -> Order:
        result = await self.session.execute(
            select(Order)
            .options(
                selectinload(Order.items),
                selectinload(Order.route),
                selectinload(Order.reorder_of),
            )
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
        # Order by the ref itself, not created_at: a backdated khata delivery
        # must never reuse the number of an order created later.
        result = await self.session.execute(
            select(Order.order_ref)
            .where(
                Order.tenant_id == self.tenant_id,
                Order.order_ref.like("ORD-%"),
            )
            .order_by(Order.order_ref.desc())
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
