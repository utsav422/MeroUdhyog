from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customer_prices.models import CustomerPrice


class CustomerPriceRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def list_for_customer(self, customer_id: UUID) -> list[CustomerPrice]:
        result = await self.session.execute(
            select(CustomerPrice)
            .where(
                CustomerPrice.tenant_id == self.tenant_id,
                CustomerPrice.customer_id == customer_id,
            )
            .order_by(CustomerPrice.updated_at.desc())
        )
        return list(result.scalars().all())

    async def list_for_variant(self, variant_id: UUID) -> list[CustomerPrice]:
        result = await self.session.execute(
            select(CustomerPrice)
            .where(
                CustomerPrice.tenant_id == self.tenant_id,
                CustomerPrice.variant_id == variant_id,
            )
            .order_by(CustomerPrice.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get(
        self, customer_id: UUID, variant_id: UUID
    ) -> CustomerPrice | None:
        result = await self.session.execute(
            select(CustomerPrice).where(
                CustomerPrice.tenant_id == self.tenant_id,
                CustomerPrice.customer_id == customer_id,
                CustomerPrice.variant_id == variant_id,
            )
        )
        return result.scalar_one_or_none()

    async def upsert(
        self, customer_id: UUID, variant_id: UUID, price: Decimal, currency: str
    ) -> CustomerPrice:
        existing = await self.get(customer_id, variant_id)
        if existing:
            existing.price = price
            existing.currency = currency
            await self.session.flush()
            await self.session.refresh(existing)
            return existing
        row = CustomerPrice(
            tenant_id=self.tenant_id,
            customer_id=customer_id,
            variant_id=variant_id,
            price=price,
            currency=currency,
        )
        self.session.add(row)
        await self.session.flush()
        await self.session.refresh(row)
        return row

    async def delete(self, customer_id: UUID, variant_id: UUID) -> bool:
        existing = await self.get(customer_id, variant_id)
        if not existing:
            return False
        await self.session.delete(existing)
        await self.session.flush()
        return True
