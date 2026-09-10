from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.predictions.models import OrderHistory


class OrderHistoryRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def create(
        self,
        customer_id: UUID,
        product_id: UUID,
        order_date: datetime,
        quantity: Decimal,
        variant_id: UUID | None = None,
        source: str = "csv",
    ) -> OrderHistory:
        row = OrderHistory(
            tenant_id=self.tenant_id,
            customer_id=customer_id,
            product_id=product_id,
            variant_id=variant_id,
            order_date=order_date,
            quantity=quantity,
            source=source,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def list(self, limit: int, offset: int) -> list[OrderHistory]:
        rows = (
            (
                await self.session.execute(
                    select(OrderHistory)
                    .options(
                        selectinload(OrderHistory.customer),
                        selectinload(OrderHistory.product),
                        selectinload(OrderHistory.variant),
                    )
                    .where(OrderHistory.tenant_id == self.tenant_id)
                    .order_by(OrderHistory.order_date.desc())
                    .limit(limit)
                    .offset(offset)
                )
            )
            .scalars()
            .all()
        )
        return list(rows)

    async def count(self) -> int:
        result = await self.session.execute(
            select(OrderHistory.id).where(OrderHistory.tenant_id == self.tenant_id)
        )
        return len(result.all())

    async def clear(self) -> int:
        """Delete all manually-added history for this tenant. Returns rows removed."""
        from sqlalchemy import delete

        result = await self.session.execute(
            delete(OrderHistory).where(OrderHistory.tenant_id == self.tenant_id)
        )
        await self.session.flush()
        return result.rowcount or 0

    async def get(self, row_id: UUID) -> OrderHistory | None:
        row = await self.session.get(OrderHistory, row_id)
        if row is not None and row.tenant_id != self.tenant_id:
            return None
        return row

    async def delete(self, row: OrderHistory) -> None:
        await self.session.delete(row)
        await self.session.flush()