from datetime import UTC, datetime
from decimal import Decimal

from app.modules.finance.calculator import LedgerRow, fold


def _row(
    type_: str,
    amount: str,
    when: str,
    currency: str = "USD",
    reverses: object | None = None,
) -> LedgerRow:
    return LedgerRow(
        type=type_,
        amount=Decimal(amount),
        transaction_date=datetime.fromisoformat(when.replace("Z", "+00:00")),
        currency=currency,
        reverses_id=reverses,
    )


def test_plain_rows_bucket_by_type():
    totals = fold(
        [
            _row("sale", "1000.00", "2026-05-10T12:00:00Z"),
            _row("purchase", "400.00", "2026-05-12T12:00:00Z"),
            _row("expense", "150.00", "2026-05-15T12:00:00Z"),
        ]
    )
    assert len(totals) == 1
    t = totals[0]
    assert t.month == datetime(2026, 5, 1, tzinfo=UTC).date()
    assert t.revenue == Decimal("1000.00")
    assert t.cogs == Decimal("400.00")
    assert t.operating_expense == Decimal("150.00")
    assert t.gross_profit == Decimal("600.00")
    assert t.net_profit == Decimal("450.00")
    assert t.transaction_count == 3
    assert t.sale_count == 1
    assert t.purchase_count == 1
    assert t.expense_count == 1


def test_reversal_cancels_original_bucket():
    totals = fold(
        [
            _row("sale", "500.00", "2026-06-05T12:00:00Z"),
            _row("purchase", "500.00", "2026-06-06T12:00:00Z", reverses="tx-1"),
        ]
    )
    t = totals[0]
    assert t.revenue == Decimal("0.00")
    assert t.cogs == Decimal("0.00")
    assert t.purchase_count == 1  # the reversal is still a ledger row


def test_reversed_purchase_subtracts_cogs():
    totals = fold(
        [
            _row("purchase", "300.00", "2026-06-01T12:00:00Z"),
            _row("sale", "300.00", "2026-06-02T12:00:00Z", reverses="tx-2"),
        ]
    )
    t = totals[0]
    assert t.cogs == Decimal("0.00")
    assert t.revenue == Decimal("0.00")


def test_reversed_expense_subtracts_expense():
    totals = fold(
        [
            _row("expense", "90.00", "2026-06-03T12:00:00Z"),
            _row("expense", "90.00", "2026-06-04T12:00:00Z", reverses="tx-3"),
        ]
    )
    t = totals[0]
    assert t.operating_expense == Decimal("0.00")


def test_rows_group_by_month():
    totals = fold(
        [
            _row("sale", "100.00", "2026-05-01T12:00:00Z"),
            _row("sale", "50.00", "2026-06-01T12:00:00Z"),
        ]
    )
    assert [t.month for t in totals] == [
        datetime(2026, 5, 1, tzinfo=UTC).date(),
        datetime(2026, 6, 1, tzinfo=UTC).date(),
    ]
    assert totals[0].revenue == Decimal("100.00")
    assert totals[1].revenue == Decimal("50.00")


def test_rows_group_by_currency():
    totals = fold(
        [
            _row("sale", "100.00", "2026-05-01T12:00:00Z", currency="USD"),
            _row("sale", "80.00", "2026-05-01T12:00:00Z", currency="EUR"),
        ]
    )
    assert len(totals) == 2
    by_currency = {t.currency: t for t in totals}
    assert by_currency["USD"].revenue == Decimal("100.00")
    assert by_currency["EUR"].revenue == Decimal("80.00")


def test_empty_ledger_yields_no_totals():
    assert fold([]) == []