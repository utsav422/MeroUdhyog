from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.models import MonthlyFinancialSummary
from app.shared.exceptions import NotFoundError


class FinanceRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def get_summary(self, month: date, currency: str) -> MonthlyFinancialSummary | None:
        row = (
            await self.session.execute(
                select(MonthlyFinancialSummary).where(
                    MonthlyFinancialSummary.tenant_id == self.tenant_id,
                    MonthlyFinancialSummary.month == month,
                    MonthlyFinancialSummary.currency == currency,
                )
            )
        ).scalar_one_or_none()
        return row

    async def upsert(self, summary: MonthlyFinancialSummary) -> MonthlyFinancialSummary:
        existing = await self.get_summary(summary.month, summary.currency)
        if existing is None:
            self.session.add(summary)
            await self.session.flush()
            return summary
        if existing is not summary:
            existing.revenue = summary.revenue
            existing.cogs = summary.cogs
            existing.operating_expense = summary.operating_expense
            existing.gross_profit = summary.gross_profit
            existing.net_profit = summary.net_profit
            existing.transaction_count = summary.transaction_count
            existing.sale_count = summary.sale_count
            existing.purchase_count = summary.purchase_count
            existing.expense_count = summary.expense_count
            await self.session.flush()
        return existing

    async def list_range(self, month_from: date, month_to: date) -> list[MonthlyFinancialSummary]:
        rows = (
            (
                await self.session.execute(
                    select(MonthlyFinancialSummary)
                    .where(
                        MonthlyFinancialSummary.tenant_id == self.tenant_id,
                        MonthlyFinancialSummary.month >= month_from,
                        MonthlyFinancialSummary.month <= month_to,
                    )
                    .order_by(MonthlyFinancialSummary.month, MonthlyFinancialSummary.currency)
                )
            )
            .scalars()
            .all()
        )
        return list(rows)

    async def delete_for_month(self, month: date, currency: str) -> None:
        await self.session.execute(
            delete(MonthlyFinancialSummary).where(
                MonthlyFinancialSummary.tenant_id == self.tenant_id,
                MonthlyFinancialSummary.month == month,
                MonthlyFinancialSummary.currency == currency,
            )
        )
        await self.session.flush()

    async def require(self, month: date, currency: str) -> MonthlyFinancialSummary:
        row = await self.get_summary(month, currency)
        if row is None:
            raise NotFoundError("No financial summary for this month")
        return row