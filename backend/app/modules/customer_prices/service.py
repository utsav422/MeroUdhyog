from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customer_prices.models import CustomerPrice
from app.modules.customer_prices.repository import CustomerPriceRepository
from app.modules.customer_prices.schemas import (
    CustomerPriceCreate,
    CustomerPriceRead,
    CustomerPriceUpdate,
    CustomerPriceWithCustomerRead,
)
from app.modules.customers.models import Customer
from app.modules.products.models import ProductVariant, VariantPrice
from app.shared.exceptions import NotFoundError


async def resolve_price(
    session: AsyncSession, tenant_id: UUID, customer_id: UUID | None, variant_id: UUID
) -> tuple[Decimal, str]:
    """Resolve the effective price for a variant for a customer.

    Returns (price, currency). Uses the customer-specific price if set,
    otherwise falls back to the variant's default (first active) price.
    """
    if customer_id:
        row = (
            await session.execute(
                select(CustomerPrice).where(
                    CustomerPrice.tenant_id == tenant_id,
                    CustomerPrice.customer_id == customer_id,
                    CustomerPrice.variant_id == variant_id,
                )
            )
        ).scalar_one_or_none()
        if row:
            return row.price, row.currency
    variant = (
        await session.execute(
            select(ProductVariant).where(
                ProductVariant.tenant_id == tenant_id,
                ProductVariant.id == variant_id,
            )
        )
    ).scalar_one_or_none()
    if not variant:
        raise NotFoundError("Variant not found")
    price_row = (
        await session.execute(
            select(VariantPrice)
            .where(
                VariantPrice.variant_id == variant_id,
                VariantPrice.is_active.is_(True),
            )
            .order_by(VariantPrice.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not price_row:
        raise NotFoundError(f"No price defined for variant {variant.name}")
    return price_row.price, price_row.currency


class CustomerPriceService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = CustomerPriceRepository(session, tenant_id)

    async def _validate(self, customer_id: UUID, variant_id: UUID) -> None:
        customer = (
            await self.session.execute(
                select(Customer.id).where(
                    Customer.tenant_id == self.tenant_id,
                    Customer.id == customer_id,
                )
            )
        ).scalar_one_or_none()
        if not customer:
            raise NotFoundError("Customer not found")
        variant = (
            await self.session.execute(
                select(ProductVariant.id).where(
                    ProductVariant.tenant_id == self.tenant_id,
                    ProductVariant.id == variant_id,
                )
            )
        ).scalar_one_or_none()
        if not variant:
            raise NotFoundError("Variant not found")

    async def list_for_customer(self, customer_id: UUID) -> list[CustomerPriceRead]:
        rows = await self.repo.list_for_customer(customer_id)
        return [CustomerPriceRead.model_validate(r) for r in rows]

    async def list_for_variant(self, variant_id: UUID) -> list[CustomerPriceWithCustomerRead]:
        variant = (
            await self.session.execute(
                select(ProductVariant.id).where(
                    ProductVariant.tenant_id == self.tenant_id,
                    ProductVariant.id == variant_id,
                )
            )
        ).scalar_one_or_none()
        if not variant:
            raise NotFoundError("Variant not found")
        rows = await self.repo.list_for_variant(variant_id)
        result: list[CustomerPriceWithCustomerRead] = []
        for row in rows:
            data = CustomerPriceWithCustomerRead.model_validate(row)
            customer = (
                await self.session.execute(
                    select(Customer.name).where(Customer.id == row.customer_id)
                )
            ).scalar_one_or_none()
            data.customer_name = customer
            result.append(data)
        return result

    async def upsert(
        self, customer_id: UUID, data: CustomerPriceCreate
    ) -> CustomerPriceRead:
        await self._validate(customer_id, data.variant_id)
        row = await self.repo.upsert(
            customer_id, data.variant_id, data.price, data.currency
        )
        return CustomerPriceRead.model_validate(row)

    async def update(
        self, customer_id: UUID, variant_id: UUID, data: CustomerPriceUpdate
    ) -> CustomerPriceRead:
        existing = await self.repo.get(customer_id, variant_id)
        if not existing:
            raise NotFoundError("Customer price not found")
        row = await self.repo.upsert(customer_id, variant_id, data.price, data.currency)
        return CustomerPriceRead.model_validate(row)

    async def delete(self, customer_id: UUID, variant_id: UUID) -> None:
        deleted = await self.repo.delete(customer_id, variant_id)
        if not deleted:
            raise NotFoundError("Customer price not found")
