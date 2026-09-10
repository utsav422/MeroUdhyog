"""Deterministic financial computation over the transactions ledger.

Accounting model (MVP, documented so it stays explainable):

- Each active transaction contributes into a single bucket keyed by its type:
  ``sale`` -> revenue, ``purchase`` -> cost of goods sold (COGS),
  ``expense`` -> operating expense.
- A transaction that reverses another entry (``reverses_id`` set) cancels the
  bucket of the *original* entry instead of counting toward its own type:
  reverse(sale) is recorded as a purchase so it subtracts from revenue;
  reverse(purchase) is recorded as a sale so it subtracts from COGS;
  reverse(expense) is recorded as an expense so it subtracts from expenses.
- Gross profit = revenue - COGS; net profit = gross profit - operating expense.
- Reversals affect the month in which they are recorded.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import NamedTuple

ZERO = Decimal("0.00")

# reverse(type) = the ledger type a reversal of `type` is recorded as.
REVERSAL_TYPE = {"sale": "purchase", "purchase": "sale", "expense": "expense"}
# Original bucket for a reversal row, given its own recorded type.
_BUCKET_FOR_REVERSAL = {v: k for k, v in REVERSAL_TYPE.items()}


class MonthTotals(NamedTuple):
    month: date
    currency: str
    revenue: Decimal
    cogs: Decimal
    operating_expense: Decimal
    transaction_count: int
    sale_count: int
    purchase_count: int
    expense_count: int

    @property
    def gross_profit(self) -> Decimal:
        return (self.revenue - self.cogs).quantize(Decimal("0.01"))

    @property
    def net_profit(self) -> Decimal:
        return (self.gross_profit - self.operating_expense).quantize(Decimal("0.01"))


def month_of(value: datetime) -> date:
    return value.date().replace(day=1)


def _bucket(type_: str, reverses_id: object | None) -> str:
    if reverses_id is None:
        return type_
    return _BUCKET_FOR_REVERSAL.get(type_, type_)


def _sign(reverses_id: object | None) -> Decimal:
    return Decimal("-1.00") if reverses_id is not None else Decimal("1.00")


class LedgerRow(NamedTuple):
    type: str
    amount: Decimal
    transaction_date: datetime
    currency: str
    reverses_id: object | None


def fold(rows: list[LedgerRow]) -> list[MonthTotals]:
    """Fold a flat list of ledger rows into per-(month, currency) totals.

    The result is ordered by month and currency and is deterministic: rows are
    summed exactly (Decimal), so identical ledgers always produce identical
    totals.
    """
    buckets: dict[tuple[date, str], dict[str, Decimal]] = {}
    counts: dict[tuple[date, str], dict[str, int]] = {}

    for row in rows:
        if row.amount is None:
            continue
        key = (month_of(row.transaction_date), row.currency)
        buckets.setdefault(key, {}).setdefault("sale", ZERO)
        counts.setdefault(key, {})
        bucket = _bucket(row.type, row.reverses_id)
        buckets[key][bucket] = buckets[key].get(bucket, ZERO) + row.amount * _sign(
            row.reverses_id
        )
        count_key = {"sale": "sale_count", "purchase": "purchase_count"}.get(
            row.type, "expense_count"
        )
        counts[key][count_key] = counts[key].get(count_key, 0) + 1

    totals: list[MonthTotals] = []
    for key in sorted(buckets):
        month, currency = key
        b = buckets[key]
        totals.append(
            MonthTotals(
                month=month,
                currency=currency,
                revenue=(b.get("sale", ZERO)).quantize(Decimal("0.01")),
                cogs=(b.get("purchase", ZERO)).quantize(Decimal("0.01")),
                operating_expense=(b.get("expense", ZERO)).quantize(Decimal("0.01")),
                transaction_count=sum(counts.get(key, {}).values()),
                sale_count=counts.get(key, {}).get("sale_count", 0),
                purchase_count=counts.get(key, {}).get("purchase_count", 0),
                expense_count=counts.get(key, {}).get("expense_count", 0),
            )
        )
    return totals