"""Credit-limit math shared by the customers, khata and orders modules.

A customer's credit usage is *derived*, never stored:

    credit_used = committed order totals - active khata payments

"Committed" means every order that still represents a real obligation, i.e.
anything except a cancelled or failed one. Using the open (not yet delivered)
orders too means the number moves the moment an order is placed — which is
what the confirmation prompt on the orders page needs — while still matching
the khata outstanding balance for the common case where nothing is pending.

A customer with `credit_limit IS NULL` has no limit: `credit_used` is still
computed (the khata screens show it as an unbounded figure) but `available` and
`utilization` are `None` so callers can render "no limit" instead of a bar.
"""

from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.khata.models import LedgerEntry
from app.modules.orders.models import Order

ZERO = Decimal("0.00")

# Orders that no longer represent an obligation. `delivered` orders are the
# ones the khata settles; the open ones are what the customer has committed to
# but has not been billed for yet.
NON_COMMITTING_STATUSES = ("cancelled", "failed")


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def clamp_used(used: Decimal | None) -> Decimal:
    """Credit usage can never be negative — an overpaid customer is at zero."""
    if used is None:
        return ZERO
    return max(_q2(used), ZERO)


def credit_available(limit: Decimal | None, used: Decimal) -> Decimal | None:
    if limit is None:
        return None
    return max(_q2(limit) - clamp_used(used), ZERO)


def credit_utilization(limit: Decimal | None, used: Decimal) -> Decimal | None:
    """Used amount as a percentage of the limit, `None` when unlimited.

    Quantized to whole percent so the client never has to guess at rounding.
    """
    if limit is None or limit <= 0:
        return None
    pct = (clamp_used(used) / Decimal(limit)) * Decimal(100)
    return pct.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def exceeds_limit(limit: Decimal | None, used: Decimal, adding: Decimal) -> bool:
    """True when `used + adding` would push the customer past their limit."""
    if limit is None:
        return False
    return clamp_used(used) + _q2(adding) > _q2(limit)


async def credit_used_map(session: AsyncSession, tenant_id: UUID) -> dict[UUID, Decimal]:
    """Credit usage for every customer of the tenant, in one pair of queries.

    Kept as a map (like `KhataRepository.billed_by_customer`) so list endpoints
    stay at two queries instead of one per row.
    """
    committed = await session.execute(
        select(Order.customer_id, func.coalesce(func.sum(Order.total_amount), 0))
        .where(
            Order.tenant_id == tenant_id,
            Order.customer_id.is_not(None),
            Order.status.notin_(list(NON_COMMITTING_STATUSES)),
        )
        .group_by(Order.customer_id)
    )
    paid = await session.execute(
        select(LedgerEntry.customer_id, func.coalesce(func.sum(LedgerEntry.amount), 0))
        .where(
            LedgerEntry.tenant_id == tenant_id,
            LedgerEntry.status == "active",
            LedgerEntry.customer_id.is_not(None),
        )
        .group_by(LedgerEntry.customer_id)
    )
    paid_map = {cid: Decimal(str(total)) for cid, total in paid.all()}
    return {
        cid: clamp_used(Decimal(str(total)) - paid_map.get(cid, ZERO))
        for cid, total in committed.all()
    }


async def credit_used_for(
    session: AsyncSession, tenant_id: UUID, customer_id: UUID
) -> Decimal:
    """Credit usage for a single customer."""
    used = await credit_used_map(session, tenant_id)
    return used.get(customer_id, ZERO)