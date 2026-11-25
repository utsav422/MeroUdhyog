from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
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


async def _detach_order_payments(
    session: AsyncSession,
    tenant_id: UUID,
    user_id: UUID | None,
    order_id: UUID,
    order_ref: str,
) -> set[date]:
    """Release every active payment's stake in the order being deleted.

    Payments used exclusively by the deleted order are voided. A payment split
    across several orders is reduced by the deleted allocation instead — leaving
    it untouched would keep freeing credit that no longer has an order behind
    it, while voiding it all would erase money still legitimately received for
    the other orders.
    """
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
                .execution_options(include_deleted=True)
            )
        )
        .scalars()
        .unique()
        .all()
    )
    khata = KhataService(session, tenant_id, user_id)
    posting = PostingService(session, tenant_id, user_id)
    months: set[date] = set()
    for entry in entries:
        fresh = await khata.repo.get_entry(entry.id)
        removed = [a for a in fresh.allocations if a.order_id == order_id]
        if not removed:
            continue
        remaining = [a for a in fresh.allocations if a.order_id != order_id]
        released = sum((a.amount_applied or Decimal("0")) for a in removed)
        months.add(month_of_dt(fresh.collected_at))
        if not remaining or released >= fresh.amount:
            await khata.void_payment_for_deletion(fresh.id, order_ref)
            continue
        fresh.amount = Decimal(str(fresh.amount)) - released
        for allocation in removed:
            await session.delete(allocation)
        months.add(month_of_dt(datetime.now(UTC)))
        receipt = (
            await session.execute(
                select(Transaction).where(
                    Transaction.tenant_id == tenant_id,
                    Transaction.external_id == f"khata-receipt:{fresh.id}",
                )
            )
        ).scalar_one_or_none()
        if receipt is not None and receipt.is_active:
            receipt.amount = fresh.amount
            await posting.repost_transaction(receipt)
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
            await _detach_order_payments(
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
