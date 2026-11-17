"""Fiscal year, accounting period and audit-trail operations."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.audit import record
from app.modules.accounting.models import AccountingPeriod, FiscalYear
from app.modules.accounting.posting import PostingService
from app.modules.accounting.repository import AccountingRepository
from app.modules.accounting.schemas import FiscalYearCreate
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError


def _month_periods(start_date: date, end_date: date):
    current = start_date
    while current <= end_date:
        if current.month == 12:
            next_month = date(current.year + 1, 1, 1)
        else:
            next_month = date(current.year, current.month + 1, 1)
        period_end = min(next_month - timedelta(days=1), end_date)
        yield current, period_end
        current = period_end + timedelta(days=1)


class PeriodService:
    def __init__(self, session: AsyncSession, tenant_id: UUID, user_id: UUID | None = None):
        self.session = session
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.repo = AccountingRepository(session, tenant_id)
        self.posting = PostingService(session, tenant_id, user_id=user_id)

    async def list_fiscal_years(self) -> list[FiscalYear]:
        return await self.repo.fiscal_years()

    async def create_fiscal_year(self, data: FiscalYearCreate) -> FiscalYear:
        if data.end_date <= data.start_date:
            raise ValidationError("Fiscal year end date must be after start date")
        for existing in await self.repo.fiscal_years():
            if data.start_date <= existing.end_date and data.end_date >= existing.start_date:
                raise ValidationError("Fiscal year overlaps an existing fiscal year")

        fiscal_year = FiscalYear(
            tenant_id=self.tenant_id,
            name=data.name,
            start_date=data.start_date,
            end_date=data.end_date,
        )
        self.session.add(fiscal_year)
        await self.session.flush()

        if data.generate_periods:
            for period_start, period_end in _month_periods(data.start_date, data.end_date):
                self.session.add(
                    AccountingPeriod(
                        tenant_id=self.tenant_id,
                        fiscal_year_id=fiscal_year.id,
                        name=period_start.strftime("%Y-%m"),
                        start_date=period_start,
                        end_date=period_end,
                    )
                )
            await self.session.flush()

        await record(
            self.session,
            self.tenant_id,
            entity_type="fiscal_year",
            entity_id=fiscal_year.id,
            action="create",
            actor_id=self.user_id,
            after={
                "name": fiscal_year.name,
                "start_date": fiscal_year.start_date,
                "end_date": fiscal_year.end_date,
                "generate_periods": data.generate_periods,
            },
        )
        return fiscal_year

    async def list_periods(self, *, fiscal_year_id: UUID | None = None) -> list[AccountingPeriod]:
        return await self.repo.periods(fiscal_year_id=fiscal_year_id)

    async def close_period(self, period_id: UUID, *, reason: str | None = None) -> AccountingPeriod:
        period = await self.repo.period(period_id, for_update=True)
        if period is None:
            raise NotFoundError("Accounting period not found")
        if period.is_closed:
            raise ConflictError("Accounting period is already closed")

        entry = await self.posting.post_closing_entry(period)
        period.is_closed = True
        period.closed_at = datetime.now(UTC)
        period.closed_by = self.user_id
        await self.session.flush()

        await record(
            self.session,
            self.tenant_id,
            entity_type="accounting_period",
            entity_id=period.id,
            action="close",
            actor_id=self.user_id,
            before={"is_closed": False},
            after={
                "is_closed": True,
                "closing_entry_id": entry.id if entry is not None else None,
            },
            reason=reason,
        )
        return period

    async def reopen_period(
        self, period_id: UUID, *, reason: str | None = None
    ) -> AccountingPeriod:
        period = await self.repo.period(period_id, for_update=True)
        if period is None:
            raise NotFoundError("Accounting period not found")
        if not period.is_closed:
            raise ConflictError("Accounting period is not closed")

        entry = await self.posting.void_closing_entry(
            period.id, reason=reason or "Accounting period reopened"
        )
        period.is_closed = False
        period.closed_at = None
        period.closed_by = None
        await self.session.flush()

        await record(
            self.session,
            self.tenant_id,
            entity_type="accounting_period",
            entity_id=period.id,
            action="reopen",
            actor_id=self.user_id,
            before={"is_closed": True},
            after={
                "is_closed": False,
                "voided_closing_entry_id": (entry.id if entry is not None else None),
            },
            reason=reason,
        )
        return period

    async def audit_logs(self, **filters):
        return await self.repo.audit_logs(**filters)
