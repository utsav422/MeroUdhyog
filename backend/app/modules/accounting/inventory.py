from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting import schemas
from app.modules.accounting.repository import AccountingRepository
from app.modules.products.models import Product, ProductVariant

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
INVENTORY_CODES = {"1040", "1050"}


def _q(value: Decimal | int | str | None) -> Decimal:
    return Decimal(value or 0).quantize(CENT)


class InventoryReconciliationService:
    def __init__(self, session: AsyncSession, tenant_id: UUID) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = AccountingRepository(session, tenant_id)

    async def reconciliation(
        self, *, as_of: date | None = None
    ) -> schemas.InventoryReconciliationResponse:
        balances = await self.repo.gl_account_balances(date_to=as_of)
        gl_inventory = _q(
            sum(
                (
                    Decimal(balance.debit) - Decimal(balance.credit)
                    for balance in balances
                    if balance.code in INVENTORY_CODES
                ),
                ZERO,
            )
        )

        rows = (
            await self.session.execute(
                select(ProductVariant, Product.name)
                .join(Product, Product.id == ProductVariant.product_id)
                .where(ProductVariant.tenant_id == self.tenant_id)
                .order_by(Product.name, ProductVariant.name)
            )
        ).all()
        result: list[schemas.InventoryReconciliationRow] = []
        stock_value = ZERO
        for variant, product_name in rows:
            quantity = int(variant.stock_quantity or 0)
            unit_cost = Decimal(variant.average_cost or 0)
            if quantity == 0 and unit_cost == ZERO:
                continue
            value = _q(quantity * unit_cost)
            stock_value += value
            result.append(
                schemas.InventoryReconciliationRow(
                    variant_id=variant.id,
                    product_id=variant.product_id,
                    product_name=product_name,
                    variant_name=variant.name,
                    sku=variant.sku,
                    quantity=quantity,
                    unit_cost=unit_cost,
                    value=value,
                )
            )
        stock_value = _q(stock_value)
        difference = _q(gl_inventory - stock_value)
        return schemas.InventoryReconciliationResponse(
            as_of=as_of,
            gl_inventory=gl_inventory,
            stock_value=stock_value,
            difference=difference,
            balanced=abs(difference) <= CENT,
            rows=result,
        )
