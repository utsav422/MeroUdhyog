from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.customers.models import Customer
from app.modules.khata.models import BillTemplate, LedgerAllocation, LedgerEntry, OrderInvoice
from app.modules.orders.models import Order
from app.modules.users.models import User
from app.shared.exceptions import NotFoundError

# Orders the khata settles. A customer only owes for what was actually
# delivered — everything still open (draft/confirmed/ready/assigned/…),
# delivered-then-reversed (cancelled) or failed is not billable.
BILLABLE_STATUSES = {"delivered"}


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
                Order.status.in_(list(BILLABLE_STATUSES)),
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
                Order.status.in_(list(BILLABLE_STATUSES)),
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

    def _payment_conditions(
        self,
        customer_id: UUID | None = None,
        method: str | None = None,
        status: str | None = None,
        route_id: UUID | None = None,
        search: str | None = None,
        date_from=None,
        date_to=None,
        order_id: UUID | None = None,
    ) -> list:
        """Shared WHERE clauses for the global payments list + its totals.

        The route filter matches payments *applied to orders* on that route
        (``route_id`` lives on the order), so a payment covering orders on
        several routes is listed under each of them.
        """
        conds = [LedgerEntry.tenant_id == self.tenant_id]
        if customer_id is not None:
            conds.append(LedgerEntry.customer_id == customer_id)
        if method is not None:
            conds.append(LedgerEntry.method == method)
        if status is not None:
            conds.append(LedgerEntry.status == status)
        if date_from is not None:
            conds.append(LedgerEntry.collected_at >= date_from)
        if date_to is not None:
            conds.append(LedgerEntry.collected_at <= date_to)
        if order_id is not None:
            conds.append(LedgerEntry.allocations.any(LedgerAllocation.order_id == order_id))
        if route_id is not None:
            conds.append(
                LedgerEntry.allocations.any(
                    LedgerAllocation.order.has(Order.route_id == route_id)
                )
            )
        if search:
            like = f"%{search.strip().lower()}%"
            conds.append(
                or_(
                    LedgerEntry.customer.has(Customer.name.ilike(like)),
                    LedgerEntry.collector.has(User.full_name.ilike(like)),
                    LedgerEntry.receipt_number.ilike(like),
                )
            )
        return conds

    async def list_payments_filtered(
        self, limit: int, offset: int, **filters
    ) -> list[LedgerEntry]:
        result = await self.session.execute(
            select(LedgerEntry)
            .options(
                selectinload(LedgerEntry.allocations).selectinload(LedgerAllocation.order),
                selectinload(LedgerEntry.customer),
                selectinload(LedgerEntry.collector),
            )
            .where(*self._payment_conditions(**filters))
            .order_by(LedgerEntry.collected_at.desc(), LedgerEntry.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().unique().all())

    async def payment_totals(self, **filters) -> tuple[int, Decimal]:
        result = await self.session.execute(
            select(
                func.count(LedgerEntry.id),
                func.coalesce(func.sum(LedgerEntry.amount), 0),
            ).where(*self._payment_conditions(**filters))
        )
        count, total = result.one()
        return int(count), Decimal(str(total))

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