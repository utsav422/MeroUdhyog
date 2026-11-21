from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.posting import PostingService
from app.modules.finance.service import FinanceService, month_of_dt
from app.modules.khata.models import LedgerAllocation, LedgerEntry
from app.modules.khata.service import KhataService
from app.modules.transactions.models import Transaction


async def _linked_transactions(
    session: AsyncSession,
    tenant_id: UUID,
    order_id: UUID | None,
    delivery_id: UUID | None,
) -> list[Transaction]:
    matchers = []
    if order_id is not None:
        matchers.append(Transaction.metadata_["order_id"].astext == str(order_id))
    if delivery_id is not None:
        matchers.append(Transaction.metadata_["delivery_id"].astext == str(delivery_id))
    if not matchers:
        return []
    result = await session.execute(
        select(Transaction).where(
            Transaction.tenant_id == tenant_id,
            or_(*matchers),
        )
    )
    return list(result.scalars().all())


async def _void_order_only_payments(
    session: AsyncSession,
    tenant_id: UUID,
    user_id: UUID | None,
    order_id: UUID,
    order_ref: str,
) -> set[date]:
    entries = (
        (
            await session.execute(
                select(LedgerEntry)
                .join(
                    LedgerAllocation,
                    LedgerAllocation.ledger_entry_id == LedgerEntry.id,
                )
                .where(
                    LedgerEntry.tenant_id == tenant_id,
                    LedgerEntry.status == "active",
                    LedgerAllocation.order_id == order_id,
                )
            )
        )
        .scalars()
        .unique()
        .all()
    )
    khata = KhataService(session, tenant_id, user_id)
    months: set[date] = set()
    for entry in entries:
        fresh = await khata.repo.get_entry(entry.id)
        if any(allocation.order_id != order_id for allocation in fresh.allocations):
            continue
        await khata.void_payment_for_deletion(fresh.id, order_ref)
        months.add(month_of_dt(fresh.collected_at))
    return months


async def void_linked_accounting(
    session: AsyncSession,
    tenant_id: UUID,
    user_id: UUID | None,
    *,
    order_id: UUID | None = None,
    delivery_id: UUID | None = None,
    order_ref: str | None = None,
    void_payments: bool = False,
) -> None:
    months: set[date] = set()
    posting = PostingService(session, tenant_id, user_id)
    for transaction in await _linked_transactions(
        session, tenant_id, order_id, delivery_id
    ):
        if not transaction.is_active:
            continue
        months.add(month_of_dt(transaction.transaction_date))
        await posting.void_for_transaction(transaction.id)
        transaction.is_active = False

    if void_payments and order_id is not None:
        months.update(
            await _void_order_only_payments(
                session,
                tenant_id,
                user_id,
                order_id,
                order_ref or str(order_id),
            )
        )

    if months:
        months.add(month_of_dt(datetime.now(UTC)))
        await FinanceService(session, tenant_id).recalculate(months)
