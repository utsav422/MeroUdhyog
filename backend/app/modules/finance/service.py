from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.calculator import LedgerRow, fold, month_of
from app.modules.finance.models import MonthlyFinancialSummary
from app.modules.finance.repository import FinanceRepository
from app.modules.finance.schemas import MonthlySummaryRead
from app.modules.transactions.models import Transaction

DEFAULT_CURRENCY = "USD"


class FinanceService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = FinanceRepository(session, tenant_id)

    async def _ledger_rows(
        self, month_from: date, month_to: date
    ) -> list[LedgerRow]:
        rows = (
            (
                await self.session.execute(
                    select(
                        Transaction.type,
                        Transaction.amount,
                        Transaction.transaction_date,
                        Transaction.currency,
                        Transaction.reverses_id,
                    ).where(
                        Transaction.tenant_id == self.tenant_id,
                        Transaction.is_active.is_(True),
                        Transaction.transaction_date >= month_from,
                        Transaction.transaction_date < month_to,
                    )
                )
            )
            .all()
        )
        return [
            LedgerRow(
                type=row.type,
                amount=row.amount,
                transaction_date=row.transaction_date,
                currency=row.currency or DEFAULT_CURRENCY,
                reverses_id=row.reverses_id,
            )
            for row in rows
        ]

    def _month_bounds(self, months: set[date]) -> tuple[date, date]:
        if not months:
            return date.today().replace(day=1), date.today().replace(day=1)
        first = min(months)
        last = max(months)
        return first, _next_month(last)

    async def _recompute(self, months: set[date]) -> list[MonthlyFinancialSummary]:
        """Recompute rollups for the given months from the ledger and persist.

        Always truthful: it re-aggregates the ledger for exactly those months,
        so callers can invoke it after any mutation of transactions.
        """
        if not months:
            return []
        month_from, month_to = self._month_bounds(months)
        rows = await self._ledger_rows(month_from, month_to)
        totals = fold(rows)
        persisted: list[MonthlyFinancialSummary] = []
        for total in totals:
            row = await self.repo.get_summary(total.month, total.currency)
            if row is None:
                row = MonthlyFinancialSummary(
                    tenant_id=self.tenant_id,
                    month=total.month,
                    currency=total.currency,
                )
            row.revenue = total.revenue
            row.cogs = total.cogs
            row.operating_expense = total.operating_expense
            row.gross_profit = total.gross_profit
            row.net_profit = total.net_profit
            row.transaction_count = total.transaction_count
            row.sale_count = total.sale_count
            row.purchase_count = total.purchase_count
            row.expense_count = total.expense_count
            await self.repo.upsert(row)
            persisted.append(row)
        if not totals:
            for month in months:
                existing = await self.repo.get_summary(month, DEFAULT_CURRENCY)
                if existing and existing.transaction_count > 0:
                    existing.transaction_count = 0
                    existing.sale_count = 0
                    existing.purchase_count = 0
                    existing.expense_count = 0
                    existing.revenue = Decimal("0.00")
                    existing.cogs = Decimal("0.00")
                    existing.operating_expense = Decimal("0.00")
                    existing.gross_profit = Decimal("0.00")
                    existing.net_profit = Decimal("0.00")
                    await self.session.flush()
        return persisted

    async def recalculate(self, months: set[date]) -> None:
        await self._recompute(months)

    async def get_summary(
        self, month: date, currency: str = DEFAULT_CURRENCY
    ) -> MonthlySummaryRead:
        rows = await self._recompute({month})
        for row in rows:
            if row.month == month and row.currency == currency:
                return MonthlySummaryRead.model_validate(row)
        zero = MonthlyFinancialSummary(
            tenant_id=self.tenant_id,
            month=month,
            currency=currency,
            revenue=Decimal("0.00"),
            cogs=Decimal("0.00"),
            operating_expense=Decimal("0.00"),
            gross_profit=Decimal("0.00"),
            net_profit=Decimal("0.00"),
            transaction_count=0,
            sale_count=0,
            purchase_count=0,
            expense_count=0,
        )
        return MonthlySummaryRead.model_validate(zero)

    async def trends(
        self,
        months: int = 6,
        end_month: date | None = None,
        currency: str = DEFAULT_CURRENCY,
    ) -> list[MonthlySummaryRead]:
        if months < 1 or months > 36:
            months = 6
        end = end_month or date.today().replace(day=1)
        want = {_add_months(end, -i).replace(day=1) for i in range(months)}
        rows = await self._recompute(want)
        by_key = {(r.month, r.currency): r for r in rows}
        result: list[MonthlySummaryRead] = []
        for month in sorted(want):
            row = by_key.get((month, currency))
            if row is None:
                zero = MonthlyFinancialSummary(
                    tenant_id=self.tenant_id,
                    month=month,
                    currency=currency,
                    revenue=Decimal("0.00"),
                    cogs=Decimal("0.00"),
                    operating_expense=Decimal("0.00"),
                    gross_profit=Decimal("0.00"),
                    net_profit=Decimal("0.00"),
                    transaction_count=0,
                    sale_count=0,
                    purchase_count=0,
                    expense_count=0,
                )
                result.append(MonthlySummaryRead.model_validate(zero))
                continue
            result.append(MonthlySummaryRead.model_validate(row))
        return result

    async def year_summary(
        self, year: int, currency: str = DEFAULT_CURRENCY
    ) -> list[MonthlySummaryRead]:
        want = {date(year, m, 1) for m in range(1, 13)}
        rows = await self._recompute(want)
        by_key = {(r.month, r.currency): r for r in rows}
        result: list[MonthlySummaryRead] = []
        for month in sorted(want):
            row = by_key.get((month, currency))
            if row is None:
                zero = MonthlyFinancialSummary(
                    tenant_id=self.tenant_id,
                    month=month,
                    currency=currency,
                    revenue=Decimal("0.00"),
                    cogs=Decimal("0.00"),
                    operating_expense=Decimal("0.00"),
                    gross_profit=Decimal("0.00"),
                    net_profit=Decimal("0.00"),
                    transaction_count=0,
                    sale_count=0,
                    purchase_count=0,
                    expense_count=0,
                )
                result.append(MonthlySummaryRead.model_validate(zero))
                continue
            result.append(MonthlySummaryRead.model_validate(row))
        return result


def _add_months(value: date, offset: int) -> date:
    month_index = value.year * 12 + (value.month - 1) + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


def _next_month(value: date) -> date:
    return _add_months(value, 1)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def month_of_dt(value: datetime) -> date:
    return month_of(as_utc(value))