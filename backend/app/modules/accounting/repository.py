"""Data access for the accounting statements.

All queries are tenant-scoped and read-only against the existing ledger/orders
schema. Kept separate from the service so the statement math is testable
without a database.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.models import AccountingSettings
from app.modules.orders.models import Order, OrderItem
from app.modules.products.models import ProductVariant, VariantPrice
from app.modules.transactions.models import Transaction


def _day_start(d: date) -> datetime:
    return datetime.combine(d, time.min)


def _signed_amount(amount: Decimal, reverses_id: object | None) -> Decimal:
    return Decimal(amount) * (Decimal("-1") if reverses_id else Decimal("1"))


class AccountingRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID) -> None:
        self.session = session
        self.tenant_id = tenant_id

    # ---- settings ------------------------------------------------------------

    async def get_settings(self) -> AccountingSettings | None:
        return (
            await self.session.execute(
                select(AccountingSettings).where(
                    AccountingSettings.tenant_id == self.tenant_id
                )
            )
        ).scalar_one_or_none()

    async def ensure_settings(self) -> AccountingSettings:
        settings = await self.get_settings()
        if settings is None:
            settings = AccountingSettings(tenant_id=self.tenant_id)
            self.session.add(settings)
            await self.session.flush()
        return settings

    # ---- ledger --------------------------------------------------------------

    async def transactions(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        customer_id: uuid.UUID | None = None,
        types: tuple[str, ...] | None = None,
        min_amount: Decimal | None = None,
        max_amount: Decimal | None = None,
    ) -> list[Transaction]:
        conditions = [Transaction.tenant_id == self.tenant_id]
        if date_from is not None:
            conditions.append(Transaction.transaction_date >= _day_start(date_from))
        if date_to is not None:
            conditions.append(
                Transaction.transaction_date
                < datetime.combine(date_to, time.max)
            )
        if customer_id is not None:
            conditions.append(Transaction.customer_id == customer_id)
        if types is not None:
            conditions.append(Transaction.type.in_(types))
        if min_amount is not None:
            conditions.append(Transaction.amount >= min_amount)
        if max_amount is not None:
            conditions.append(Transaction.amount <= max_amount)
        rows = (
            await self.session.execute(
                select(Transaction)
                .where(and_(*conditions))
                .order_by(Transaction.transaction_date)
            )
        ).scalars().all()
        return list(rows)

    async def transactions_before(self, cutoff: date) -> list[Transaction]:
        """Every ledger row strictly before ``cutoff`` (for opening positions)."""
        rows = (
            await self.session.execute(
                select(Transaction)
                .where(
                    Transaction.tenant_id == self.tenant_id,
                    Transaction.transaction_date < _day_start(cutoff),
                )
                .order_by(Transaction.transaction_date)
            )
        ).scalars().all()
        return list(rows)

    # ---- receivables / inventory --------------------------------------------

    async def open_receivables(self, as_of: date | None = None) -> Decimal:
        """Receivables from the ledger: uncollected sales (sales − receipts).

        A sale is recognised on delivery (the `sale` row) and a receipt clears
        it. What remains uncollected is the customer balance owed to the
        business, so the balance sheet reads it straight from the ledger rather
        than from order rows (which may lag the ledger).
        """
        conditions = [Transaction.tenant_id == self.tenant_id]
        if as_of is not None:
            conditions.append(
                Transaction.transaction_date < datetime.combine(as_of, time.max)
            )
        rows = (
            await self.session.execute(
                select(Transaction).where(and_(*conditions))
            )
        ).scalars().all()

        receivables = Decimal("0.00")
        for t in rows:
            amount = _signed_amount(t.amount, t.reverses_id)
            if t.type == "sale":
                receivables += amount
            elif t.type == "receipt":
                receivables -= amount
        return receivables.quantize(Decimal("0.01"))

    async def purchases_total(self, as_of: date | None = None) -> Decimal:
        conditions = [Transaction.tenant_id == self.tenant_id, Transaction.type == "purchase"]
        if as_of is not None:
            conditions.append(
                Transaction.transaction_date < datetime.combine(as_of, time.max)
            )
        rows = (
            await self.session.execute(
                select(Transaction).where(and_(*conditions))
            )
        ).scalars().all()
        total = sum(
            (_signed_amount(t.amount, t.reverses_id) for t in rows), Decimal("0.00")
        )
        return total.quantize(Decimal("0.01"))

    async def inventory_value(self) -> Decimal:
        """Stock on hand valued at latest cost price per variant."""
        variants = (
            await self.session.execute(
                select(ProductVariant.id, ProductVariant.stock_quantity).where(
                    ProductVariant.tenant_id == self.tenant_id
                )
            )
        ).all()
        total = Decimal("0.00")
        for variant_id, stock_qty in variants:
            if not stock_qty:
                continue
            price = (
                await self.session.execute(
                    select(VariantPrice)
                    .where(
                        VariantPrice.tenant_id == self.tenant_id,
                        VariantPrice.variant_id == variant_id,
                    )
                    .order_by(
                        VariantPrice.effective_from.desc().nullslast(),
                        VariantPrice.created_at.desc(),
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            if price is None:
                continue
            cost = price.cost_price if price.cost_price is not None else price.price
            total += Decimal(cost or 0) * Decimal(stock_qty)
        return total.quantize(Decimal("0.01"))

    # ---- COGS (cost-price basis) --------------------------------------------

    async def cost_of_goods_sold(
        self, *, date_from: date | None = None, date_to: date | None = None
    ) -> tuple[Decimal, bool]:
        """Return (cogs, used_cost_price).

        Primary basis: delivered order items × the variant's latest cost price
        (``VariantPrice.cost_price``). If a tenant has order items but none of
        their variants carry a cost price, we fall back to purchase transactions
        so the figure is never silently zero.
        """
        conditions = [
            OrderItem.tenant_id == self.tenant_id,
            Order.status.in_(("delivered", "completed")),
        ]
        if date_from is not None:
            conditions.append(Order.updated_at >= _day_start(date_from))
        if date_to is not None:
            conditions.append(Order.updated_at < datetime.combine(date_to, time.max))

        rows = (
            await self.session.execute(
                select(OrderItem.variant_id, OrderItem.quantity)
                .join(Order, Order.id == OrderItem.order_id)
                .where(and_(*conditions))
            )
        ).all()

        total = Decimal("0.00")
        priced = False
        for variant_id, quantity in rows:
            if variant_id is None or not quantity:
                continue
            price = (
                await self.session.execute(
                    select(VariantPrice)
                    .where(
                        VariantPrice.tenant_id == self.tenant_id,
                        VariantPrice.variant_id == variant_id,
                        VariantPrice.cost_price.is_not(None),
                    )
                    .order_by(
                        VariantPrice.effective_from.desc().nullslast(),
                        VariantPrice.created_at.desc(),
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            if price is None or price.cost_price is None:
                continue
            priced = True
            total += Decimal(price.cost_price) * Decimal(quantity)

        if priced:
            return total.quantize(Decimal("0.01")), True

        # Fallback: purchase transactions.
        purchases = await self.transactions(
            date_from=date_from, date_to=date_to, types=("purchase",)
        )
        fallback = sum(
            (_signed_amount(t.amount, t.reverses_id) for t in purchases),
            Decimal("0.00"),
        )
        return fallback.quantize(Decimal("0.01")), False

    # ---- cash receipts -------------------------------------------------------

    async def receipts_total(
        self, *, date_from: date | None = None, date_to: date | None = None
    ) -> Decimal:
        rows = await self.transactions(
            date_from=date_from, date_to=date_to, types=("receipt",)
        )
        total = sum(
            (_signed_amount(t.amount, t.reverses_id) for t in rows),
            Decimal("0.00"),
        )
        return total.quantize(Decimal("0.01"))

    async def cash_balance(self, as_of: date | None = None) -> Decimal:
        """Cash = receipts − expenses − purchases. Sales are on credit until
        collected, so they never add cash directly."""
        conditions = [Transaction.tenant_id == self.tenant_id]
        if as_of is not None:
            conditions.append(
                Transaction.transaction_date < datetime.combine(as_of, time.max)
            )
        rows = (
            await self.session.execute(
                select(Transaction).where(and_(*conditions))
            )
        ).scalars().all()

        cash = Decimal("0.00")
        for t in rows:
            amount = _signed_amount(t.amount, t.reverses_id)
            if t.type == "receipt":
                cash += amount
            elif t.type in ("expense", "purchase"):
                cash -= amount
        return cash.quantize(Decimal("0.01"))
