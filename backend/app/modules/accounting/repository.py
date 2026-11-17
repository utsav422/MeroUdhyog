"""Data access for the accounting statements.

All queries are tenant-scoped and read-only against the existing ledger/orders
schema. Kept separate from the service so the statement math is testable
without a database.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.accounting.models import (
    Account,
    AccountingAuditLog,
    AccountingPeriod,
    AccountingSettings,
    FiscalYear,
    JournalEntry,
    JournalLine,
)
from app.modules.customers.models import Customer
from app.modules.orders.models import Order, OrderItem
from app.modules.products.models import ProductVariant, VariantPrice
from app.modules.transactions.models import Transaction


@dataclass(frozen=True)
class AccountMovement:
    account_id: uuid.UUID
    code: str
    name: str
    account_type: str
    normal_balance: str
    is_group: bool
    debit: Decimal
    credit: Decimal


@dataclass(frozen=True)
class LedgerLine:
    line_id: uuid.UUID
    entry_id: uuid.UUID
    entry_no: str
    entry_date: date
    voucher_type: str
    reference: str | None
    narration: str | None
    line_no: int
    account_id: uuid.UUID
    account_code: str
    account_name: str
    account_type: str
    normal_balance: str
    debit: Decimal
    credit: Decimal
    description: str | None
    party_type: str | None
    party_id: uuid.UUID | None


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
                select(AccountingSettings).where(AccountingSettings.tenant_id == self.tenant_id)
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
            conditions.append(Transaction.transaction_date < datetime.combine(date_to, time.max))
        if customer_id is not None:
            conditions.append(Transaction.customer_id == customer_id)
        if types is not None:
            conditions.append(Transaction.type.in_(types))
        if min_amount is not None:
            conditions.append(Transaction.amount >= min_amount)
        if max_amount is not None:
            conditions.append(Transaction.amount <= max_amount)
        rows = (
            (
                await self.session.execute(
                    select(Transaction)
                    .where(and_(*conditions))
                    .order_by(Transaction.transaction_date)
                )
            )
            .scalars()
            .all()
        )
        return list(rows)

    async def earliest_transaction_date(self) -> date | None:
        value = (
            await self.session.execute(
                select(func.min(Transaction.transaction_date)).where(
                    Transaction.tenant_id == self.tenant_id
                )
            )
        ).scalar_one()
        return value.date() if value else None

    async def transactions_before(self, cutoff: date) -> list[Transaction]:
        """Every ledger row strictly before ``cutoff`` (for opening positions)."""
        rows = (
            (
                await self.session.execute(
                    select(Transaction)
                    .where(
                        Transaction.tenant_id == self.tenant_id,
                        Transaction.transaction_date < _day_start(cutoff),
                    )
                    .order_by(Transaction.transaction_date)
                )
            )
            .scalars()
            .all()
        )
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
            conditions.append(Transaction.transaction_date < datetime.combine(as_of, time.max))
        rows = (
            (await self.session.execute(select(Transaction).where(and_(*conditions))))
            .scalars()
            .all()
        )

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
            conditions.append(Transaction.transaction_date < datetime.combine(as_of, time.max))
        rows = (
            (await self.session.execute(select(Transaction).where(and_(*conditions))))
            .scalars()
            .all()
        )
        total = sum((_signed_amount(t.amount, t.reverses_id) for t in rows), Decimal("0.00"))
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
        rows = await self.transactions(date_from=date_from, date_to=date_to, types=("receipt",))
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
            conditions.append(Transaction.transaction_date < datetime.combine(as_of, time.max))
        rows = (
            (await self.session.execute(select(Transaction).where(and_(*conditions))))
            .scalars()
            .all()
        )

        cash = Decimal("0.00")
        for t in rows:
            amount = _signed_amount(t.amount, t.reverses_id)
            if t.type == "receipt":
                cash += amount
            elif t.type in ("expense", "purchase"):
                cash -= amount
        return cash.quantize(Decimal("0.01"))

    # ---- general ledger reads ------------------------------------------------

    async def account(self, account_id: uuid.UUID) -> Account | None:
        return (
            await self.session.execute(
                select(Account).where(
                    Account.id == account_id,
                    Account.tenant_id == self.tenant_id,
                )
            )
        ).scalar_one_or_none()

    async def account_by_code(self, code: str) -> Account | None:
        return (
            await self.session.execute(
                select(Account).where(
                    Account.tenant_id == self.tenant_id,
                    Account.code == code,
                )
            )
        ).scalar_one_or_none()

    async def accounts(
        self,
        *,
        account_type: str | None = None,
        is_group: bool | None = None,
        is_active: bool | None = None,
    ) -> list[Account]:
        conditions = [Account.tenant_id == self.tenant_id]
        if account_type is not None:
            conditions.append(Account.account_type == account_type)
        if is_group is not None:
            conditions.append(Account.is_group == is_group)
        if is_active is not None:
            conditions.append(Account.is_active == is_active)
        rows = await self.session.execute(
            select(Account).where(and_(*conditions)).order_by(Account.code)
        )
        return list(rows.scalars().all())

    async def journal_entries(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        voucher_type: str | None = None,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[JournalEntry]:
        conditions = [JournalEntry.tenant_id == self.tenant_id]
        if voucher_type is not None:
            conditions.append(JournalEntry.voucher_type == voucher_type)
        if status is not None:
            conditions.append(JournalEntry.status == status)
        if date_from is not None:
            conditions.append(JournalEntry.entry_date >= date_from)
        if date_to is not None:
            conditions.append(JournalEntry.entry_date <= date_to)
        rows = await self.session.execute(
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines))
            .where(and_(*conditions))
            .order_by(JournalEntry.entry_date.desc(), JournalEntry.entry_no.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(rows.scalars().all())

    async def journal_entry(self, entry_id: uuid.UUID) -> JournalEntry | None:
        rows = await self.session.execute(
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines))
            .where(
                JournalEntry.id == entry_id,
                JournalEntry.tenant_id == self.tenant_id,
            )
        )
        return rows.scalar_one_or_none()

    # ---- reconciliation ------------------------------------------------------

    async def gl_account_totals(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict[str, tuple[Decimal, Decimal]]:
        conditions = [
            JournalEntry.tenant_id == self.tenant_id,
            JournalEntry.status == "posted",
        ]
        if date_from is not None:
            conditions.append(JournalEntry.entry_date >= date_from)
        if date_to is not None:
            conditions.append(JournalEntry.entry_date <= date_to)
        rows = await self.session.execute(
            select(
                Account.code,
                func.coalesce(func.sum(JournalLine.debit), 0),
                func.coalesce(func.sum(JournalLine.credit), 0),
            )
            .join(JournalLine, JournalLine.account_id == Account.id)
            .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
            .where(
                Account.tenant_id == self.tenant_id,
                JournalLine.tenant_id == self.tenant_id,
                *conditions,
            )
            .group_by(Account.code)
        )
        return {
            code: (Decimal(debit or 0), Decimal(credit or 0)) for code, debit, credit in rows.all()
        }

    async def active_transaction_sources(self) -> set[uuid.UUID]:
        rows = await self.session.execute(
            select(JournalEntry.source_id).where(
                JournalEntry.tenant_id == self.tenant_id,
                JournalEntry.source_type == "transaction",
                JournalEntry.source_id.is_not(None),
                JournalEntry.status != "void",
            )
        )
        return {source_id for source_id in rows.scalars().all() if source_id}

    async def unbalanced_entry_count(self) -> int:
        rows = await self.session.execute(
            select(JournalEntry.id)
            .join(JournalLine, JournalLine.journal_entry_id == JournalEntry.id)
            .where(
                JournalEntry.tenant_id == self.tenant_id,
                JournalEntry.status == "posted",
            )
            .group_by(JournalEntry.id)
            .having(func.sum(JournalLine.debit) != func.sum(JournalLine.credit))
        )
        return len(rows.all())

    async def duplicate_active_entry_count(self) -> int:
        duplicates = (
            select(
                JournalEntry.tenant_id,
                JournalEntry.source_type,
                JournalEntry.source_id,
            )
            .where(
                JournalEntry.tenant_id == self.tenant_id,
                JournalEntry.source_type.is_not(None),
                JournalEntry.source_id.is_not(None),
                JournalEntry.status != "void",
            )
            .group_by(
                JournalEntry.tenant_id,
                JournalEntry.source_type,
                JournalEntry.source_id,
            )
            .having(func.count() > 1)
            .subquery()
        )
        return (
            await self.session.execute(select(func.count()).select_from(duplicates))
        ).scalar_one()

    # ---- GL report reads -----------------------------------------------------

    async def gl_account_balances(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        exclude_voucher_types: list[str] | None = None,
    ) -> list[AccountMovement]:
        conditions = [
            JournalEntry.tenant_id == self.tenant_id,
            JournalEntry.status == "posted",
        ]
        if date_from is not None:
            conditions.append(JournalEntry.entry_date >= date_from)
        if date_to is not None:
            conditions.append(JournalEntry.entry_date <= date_to)
        if exclude_voucher_types:
            conditions.append(JournalEntry.voucher_type.notin_(exclude_voucher_types))
        rows = await self.session.execute(
            select(
                Account.id,
                Account.code,
                Account.name,
                Account.account_type,
                Account.normal_balance,
                Account.is_group,
                func.coalesce(func.sum(JournalLine.debit), 0),
                func.coalesce(func.sum(JournalLine.credit), 0),
            )
            .join(JournalLine, JournalLine.account_id == Account.id)
            .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
            .where(
                Account.tenant_id == self.tenant_id,
                JournalLine.tenant_id == self.tenant_id,
                *conditions,
            )
            .group_by(
                Account.id,
                Account.code,
                Account.name,
                Account.account_type,
                Account.normal_balance,
                Account.is_group,
            )
            .order_by(Account.code)
        )
        return [
            AccountMovement(
                account_id=account_id,
                code=code,
                name=name,
                account_type=account_type,
                normal_balance=normal_balance,
                is_group=is_group,
                debit=Decimal(debit or 0),
                credit=Decimal(credit or 0),
            )
            for (
                account_id,
                code,
                name,
                account_type,
                normal_balance,
                is_group,
                debit,
                credit,
            ) in rows.all()
        ]

    async def gl_account_balance(
        self,
        account_id: uuid.UUID,
        *,
        date_to: date | None = None,
    ) -> Decimal:
        conditions = [
            JournalEntry.tenant_id == self.tenant_id,
            JournalEntry.status == "posted",
            JournalLine.account_id == account_id,
        ]
        if date_to is not None:
            conditions.append(JournalEntry.entry_date <= date_to)
        debit, credit = (
            await self.session.execute(
                select(
                    func.coalesce(func.sum(JournalLine.debit), 0),
                    func.coalesce(func.sum(JournalLine.credit), 0),
                )
                .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
                .where(JournalLine.tenant_id == self.tenant_id, *conditions)
            )
        ).one()
        return Decimal(debit or 0) - Decimal(credit or 0)

    async def gl_lines(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        account_id: uuid.UUID | None = None,
        account_code: str | None = None,
        party_type: str | None = None,
        party_id: uuid.UUID | None = None,
        party_id_is_null: bool = False,
    ) -> list[LedgerLine]:
        conditions = [
            JournalEntry.tenant_id == self.tenant_id,
            JournalEntry.status == "posted",
        ]
        if date_from is not None:
            conditions.append(JournalEntry.entry_date >= date_from)
        if date_to is not None:
            conditions.append(JournalEntry.entry_date <= date_to)
        if account_id is not None:
            conditions.append(JournalLine.account_id == account_id)
        if account_code is not None:
            conditions.append(Account.code == account_code)
        if party_type is not None:
            conditions.append(JournalLine.party_type == party_type)
        if party_id is not None:
            conditions.append(JournalLine.party_id == party_id)
        if party_id_is_null:
            conditions.append(JournalLine.party_id.is_(None))

        rows = await self.session.execute(
            select(JournalLine, JournalEntry, Account)
            .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
            .join(Account, Account.id == JournalLine.account_id)
            .where(JournalLine.tenant_id == self.tenant_id, *conditions)
            .order_by(
                JournalEntry.entry_date,
                JournalEntry.entry_no,
                JournalLine.line_no,
            )
        )
        return [
            LedgerLine(
                line_id=line.id,
                entry_id=entry.id,
                entry_no=entry.entry_no,
                entry_date=entry.entry_date,
                voucher_type=entry.voucher_type,
                reference=entry.reference,
                narration=entry.narration,
                line_no=line.line_no,
                account_id=account.id,
                account_code=account.code,
                account_name=account.name,
                account_type=account.account_type,
                normal_balance=account.normal_balance,
                debit=Decimal(line.debit or 0),
                credit=Decimal(line.credit or 0),
                description=line.description,
                party_type=line.party_type,
                party_id=line.party_id,
            )
            for line, entry, account in rows.all()
        ]

    async def gl_entries_with_lines(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        account_codes: set[str] | None = None,
        voucher_type: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[JournalEntry]:
        conditions = [
            JournalEntry.tenant_id == self.tenant_id,
            JournalEntry.status == "posted",
        ]
        if date_from is not None:
            conditions.append(JournalEntry.entry_date >= date_from)
        if date_to is not None:
            conditions.append(JournalEntry.entry_date <= date_to)
        if voucher_type is not None:
            conditions.append(JournalEntry.voucher_type == voucher_type)

        statement = (
            select(JournalEntry).options(selectinload(JournalEntry.lines)).where(and_(*conditions))
        )
        if account_codes:
            entry_ids = (
                select(JournalLine.journal_entry_id)
                .join(Account, Account.id == JournalLine.account_id)
                .where(
                    JournalLine.tenant_id == self.tenant_id,
                    Account.tenant_id == self.tenant_id,
                    Account.code.in_(account_codes),
                )
            )
            statement = statement.where(JournalEntry.id.in_(entry_ids))

        statement = statement.order_by(JournalEntry.entry_date, JournalEntry.entry_no)
        if limit is not None:
            statement = statement.limit(limit).offset(offset)
        rows = await self.session.execute(statement)
        return list(rows.scalars().all())

    async def customer_names(self, customer_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not customer_ids:
            return {}
        rows = await self.session.execute(
            select(Customer.id, Customer.name).where(
                Customer.tenant_id == self.tenant_id,
                Customer.id.in_(customer_ids),
            )
        )
        return dict(rows.all())

    # ---- fiscal years and periods --------------------------------------------

    async def fiscal_years(self) -> list[FiscalYear]:
        rows = await self.session.execute(
            select(FiscalYear)
            .where(FiscalYear.tenant_id == self.tenant_id)
            .order_by(FiscalYear.start_date)
        )
        return list(rows.scalars().all())

    async def fiscal_year(self, fiscal_year_id: uuid.UUID) -> FiscalYear | None:
        return (
            await self.session.execute(
                select(FiscalYear).where(
                    FiscalYear.tenant_id == self.tenant_id,
                    FiscalYear.id == fiscal_year_id,
                )
            )
        ).scalar_one_or_none()

    async def periods(self, *, fiscal_year_id: uuid.UUID | None = None) -> list[AccountingPeriod]:
        conditions = [AccountingPeriod.tenant_id == self.tenant_id]
        if fiscal_year_id is not None:
            conditions.append(AccountingPeriod.fiscal_year_id == fiscal_year_id)
        rows = await self.session.execute(
            select(AccountingPeriod).where(and_(*conditions)).order_by(AccountingPeriod.start_date)
        )
        return list(rows.scalars().all())

    async def period(
        self, period_id: uuid.UUID, *, for_update: bool = False
    ) -> AccountingPeriod | None:
        statement = select(AccountingPeriod).where(
            AccountingPeriod.tenant_id == self.tenant_id,
            AccountingPeriod.id == period_id,
        )
        if for_update:
            statement = statement.with_for_update()
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def closed_period_for_date(self, entry_date: date) -> AccountingPeriod | None:
        return (
            (
                await self.session.execute(
                    select(AccountingPeriod).where(
                        AccountingPeriod.tenant_id == self.tenant_id,
                        AccountingPeriod.start_date <= entry_date,
                        AccountingPeriod.end_date >= entry_date,
                        AccountingPeriod.is_closed.is_(True),
                    )
                )
            )
            .scalars()
            .first()
        )

    # ---- audit trail ---------------------------------------------------------

    async def audit_logs(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        action: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[AccountingAuditLog]:
        conditions = [AccountingAuditLog.tenant_id == self.tenant_id]
        if entity_type is not None:
            conditions.append(AccountingAuditLog.entity_type == entity_type)
        if entity_id is not None:
            conditions.append(AccountingAuditLog.entity_id == entity_id)
        if action is not None:
            conditions.append(AccountingAuditLog.action == action)
        if date_from is not None:
            conditions.append(
                AccountingAuditLog.created_at >= datetime.combine(date_from, time.min)
            )
        if date_to is not None:
            conditions.append(AccountingAuditLog.created_at < datetime.combine(date_to, time.max))
        rows = await self.session.execute(
            select(AccountingAuditLog)
            .where(and_(*conditions))
            .order_by(AccountingAuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(rows.scalars().all())
