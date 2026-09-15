from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.customers.models import Customer
from app.modules.khata.models import BillTemplate, LedgerAllocation, LedgerEntry, OrderInvoice
from app.modules.orders.models import Order
from app.shared.exceptions import NotFoundError

# Orders the khata settles. Draft orders haven't been placed yet and cancelled
# orders are void — neither carries an amount a customer can be billed for.
BILLABLE_EXCLUDED_STATUSES = {"draft", "cancelled"}


class KhataRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    # ---- customers + balances -------------------------------------------------

    async def list_customers(self) -> list[Customer]:
        result = await self.session.execute(
            select(Customer).where(Customer.tenant_id == self.tenant_id).order_by(Customer.name)
        )
        return list(result.scalars().all())

    async def get_customer(self, customer_id: UUID) -> Customer:
        result = await self.session.execute(
            select(Customer).where(
                Customer.id == customer_id, Customer.tenant_id == self.tenant_id
            )
        )
        customer = result.scalar_one_or_none()
        if not customer:
            raise NotFoundError("Customer not found")
        return customer

    async def billed_by_customer(self) -> dict[UUID, tuple[Decimal, int]]:
        """Sum of billable order totals + their count, per customer."""
        rows = await self.session.execute(
            select(
                Order.customer_id,
                func.coalesce(func.sum(Order.total_amount), 0),
                func.count(Order.id),
            )
            .where(
                Order.tenant_id == self.tenant_id,
                Order.customer_id.is_not(None),
                Order.status.not_in(list(BILLABLE_EXCLUDED_STATUSES)),
            )
            .group_by(Order.customer_id)
        )
        return {cid: (Decimal(str(total)), count) for cid, total, count in rows.all()}

    async def paid_by_customer(self) -> dict[UUID, Decimal]:
        """Sum of active payments, per customer."""
        rows = await self.session.execute(
            select(
                LedgerEntry.customer_id,
                func.coalesce(func.sum(LedgerEntry.amount), 0),
            )
            .where(
                LedgerEntry.tenant_id == self.tenant_id,
                LedgerEntry.status == "active",
                LedgerEntry.customer_id.is_not(None),
            )
            .group_by(LedgerEntry.customer_id)
        )
        return {cid: Decimal(str(total)) for cid, total in rows.all()}

    async def last_payment_by_customer(self) -> dict[UUID, tuple[object, Decimal]]:
        """Latest active payment (collected_at, amount) per customer."""
        rows = await self.session.execute(
            select(LedgerEntry.customer_id, LedgerEntry.collected_at, LedgerEntry.amount)
            .distinct(LedgerEntry.customer_id)
            .where(
                LedgerEntry.tenant_id == self.tenant_id,
                LedgerEntry.status == "active",
                LedgerEntry.customer_id.is_not(None),
            )
            .order_by(LedgerEntry.customer_id, LedgerEntry.collected_at.desc())
        )
        return {
            cid: (collected_at, Decimal(str(amount)))
            for cid, collected_at, amount in rows.all()
        }

    # ---- orders ----------------------------------------------------------------

    async def list_billable_orders(self, customer_id: UUID) -> list[Order]:
        result = await self.session.execute(
            select(Order)
            .where(
                Order.tenant_id == self.tenant_id,
                Order.customer_id == customer_id,
                Order.status.not_in(list(BILLABLE_EXCLUDED_STATUSES)),
            )
            .order_by(Order.created_at.asc())
        )
        return list(result.scalars().all())

    async def get_order(self, order_id: UUID) -> Order:
        result = await self.session.execute(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.customer))
            .where(Order.id == order_id, Order.tenant_id == self.tenant_id)
        )
        order = result.scalars().unique().one_or_none()
        if not order:
            raise NotFoundError("Order not found")
        return order

    # ---- ledger entries --------------------------------------------------------

    async def list_payments(self, customer_id: UUID) -> list[LedgerEntry]:
        result = await self.session.execute(
            select(LedgerEntry)
            .options(
                selectinload(LedgerEntry.allocations).selectinload(LedgerAllocation.order),
                selectinload(LedgerEntry.customer),
                selectinload(LedgerEntry.collector),
            )
            .where(
                LedgerEntry.tenant_id == self.tenant_id,
                LedgerEntry.customer_id == customer_id,
            )
            .order_by(LedgerEntry.collected_at.desc(), LedgerEntry.created_at.desc())
        )
        return list(result.scalars().unique().all())

    async def get_entry(self, entry_id: UUID) -> LedgerEntry:
        result = await self.session.execute(
            select(LedgerEntry)
            .options(
                selectinload(LedgerEntry.allocations)
                .selectinload(LedgerAllocation.order)
                .selectinload(Order.items),
                selectinload(LedgerEntry.customer),
                selectinload(LedgerEntry.collector),
            )
            .where(LedgerEntry.id == entry_id, LedgerEntry.tenant_id == self.tenant_id)
        )
        entry = result.scalars().unique().one_or_none()
        if not entry:
            raise NotFoundError("Receipt not found")
        return entry

    async def add_allocation(self, entry_id: UUID, order_id: UUID, amount) -> LedgerAllocation:
        alloc = LedgerAllocation(
            tenant_id=self.tenant_id,
            ledger_entry_id=entry_id,
            order_id=order_id,
            amount_applied=amount,
        )
        self.session.add(alloc)
        return alloc

    # ---- invoices ---------------------------------------------------------------

    async def get_invoice_by_order(self, order_id: UUID) -> OrderInvoice | None:
        result = await self.session.execute(
            select(OrderInvoice).where(
                OrderInvoice.tenant_id == self.tenant_id,
                OrderInvoice.order_id == order_id,
            )
        )
        return result.scalar_one_or_none()

    async def add_invoice(
        self,
        order_id: UUID,
        invoice_number: str,
        snapshot: dict | None,
        requested_by,
        data: dict | None = None,
    ) -> OrderInvoice:
        invoice = OrderInvoice(
            tenant_id=self.tenant_id,
            order_id=order_id,
            invoice_number=invoice_number,
            template_snapshot=snapshot,
            data=data,
            created_by=requested_by,
        )
        self.session.add(invoice)
        await self.session.flush()
        return invoice

    async def get_invoiced_order_ids(self) -> list[UUID]:
        result = await self.session.execute(
            select(OrderInvoice.order_id).where(
                OrderInvoice.tenant_id == self.tenant_id
            )
        )
        return list(result.scalars().all())

    async def get_template(self) -> BillTemplate | None:
        result = await self.session.execute(
            select(BillTemplate).where(BillTemplate.tenant_id == self.tenant_id)
        )
        return result.scalars().one_or_none()

    async def add_template(self) -> BillTemplate:
        template = BillTemplate(tenant_id=self.tenant_id)
        self.session.add(template)
        await self.session.flush()
        return template

    async def get_template_or_create(self) -> BillTemplate:
        template = await self.get_template()
        if template is None:
            template = await self.add_template()
        return template