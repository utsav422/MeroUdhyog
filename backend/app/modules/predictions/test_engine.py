"""Unit tests for the pure prediction engine.

``engine.py`` is pure math over plain ``OrderEvent`` lists, so these tests
need no database, no fixtures, and no HTTP client — just Python.
"""

from datetime import date, timedelta

import pytest

from app.modules.predictions.engine import (
    OrderEvent,
    predict_product,
    tenant_average_gap,
)


def _order(
    order_date: date,
    quantity: float = 10.0,
    product_id: str = "p1",
    product_name: str = "Widget",
) -> OrderEvent:
    return OrderEvent(
        product_id=product_id,
        product_name=product_name,
        order_date=order_date,
        quantity=quantity,
        variant_id="v1",
        variant_name="Blue",
        sku="SKU-1",
    )


def _regular_buyer() -> list[OrderEvent]:
    """Five orders exactly 30 days apart — a perfectly consistent cadence."""
    return [
        _order(date(2026, 1, 1), 10),
        _order(date(2026, 1, 31), 11),
        _order(date(2026, 3, 2), 10),
        _order(date(2026, 4, 1), 12),
        _order(date(2026, 5, 1), 11),
    ]


# 1. Consistent regular buyer ------------------------------------------------


def test_consistent_buyer_is_high_confidence_and_on_track():
    pred = predict_product(_regular_buyer(), today=date(2026, 5, 15))

    assert pred.order_count == 5
    assert pred.confidence == "high"
    assert pred.stock_status == "on_track"
    assert pred.recommendation == "wait"

    # Perfectly even cadence => every gap is 30 days.
    assert pred.avg_gap_days == pytest.approx(30.0)
    assert pred.median_gap_days == pytest.approx(30.0)

    # Next order expected 30 days after the last one.
    assert pred.next_order_date == date(2026, 5, 31)
    assert pred.days_until_next == 16
    assert pred.days_of_stock == pytest.approx(16.0)

    assert pred.quantity_trend == "stable"
    assert 0 <= pred.interest_score <= 100


def test_consistent_buyer_becomes_overdue_once_expected_date_passes():
    pred = predict_product(_regular_buyer(), today=date(2026, 6, 20))

    assert pred.stock_status == "overdue"
    assert pred.days_until_next < 0
    assert pred.days_of_stock is None
    # Overdue + trustworthy forecast => call them.
    assert pred.confidence == "high"
    assert pred.recommendation == "call"


# 2. One-time buyer ----------------------------------------------------------


def test_one_time_buyer_is_insufficient_data_and_does_not_crash():
    pred = predict_product([_order(date(2026, 5, 1), quantity=15)], today=date(2026, 5, 10))

    assert pred.order_count == 1
    assert pred.stock_status == "insufficient_data"
    assert pred.confidence == "low"
    assert pred.recommendation == "wait"

    # We still remember their order size, but nothing else is knowable.
    assert pred.avg_quantity == pytest.approx(15.0)
    assert pred.quantity_trend is None
    assert pred.avg_gap_days is None
    assert pred.median_gap_days is None
    assert pred.next_order_date is None
    assert pred.days_until_next is None
    assert pred.days_of_stock is None

    # Interest stays in the modest 10-20 baseline band for thin history.
    assert 10 <= pred.interest_score <= 20


# 3. Erratic buyer -----------------------------------------------------------


def test_erratic_buyer_is_capped_at_low_confidence_despite_volume():
    # Six orders with wildly uneven spacing: 5, 59, 3, 45, 3 days apart.
    events = [
        _order(date(2026, 1, 1), 10),
        _order(date(2026, 1, 6), 10),
        _order(date(2026, 3, 6), 10),
        _order(date(2026, 3, 9), 10),
        _order(date(2026, 4, 23), 10),
        _order(date(2026, 4, 26), 10),
    ]
    pred = predict_product(events, today=date(2026, 5, 1))

    assert pred.order_count == 6
    # Enough orders for "high", but erratic rhythm caps confidence at low.
    assert pred.confidence == "low"
    assert pred.stock_status in {"overdue", "due_soon", "on_track"}


# 4. Outlier gap -------------------------------------------------------------


def test_outlier_gap_does_not_drag_the_average_gap():
    # Regular 30-day rhythm except one 180-day gap (holiday/stock-out).
    start = date(2026, 1, 1)
    events = [
        _order(start),
        _order(start + timedelta(days=30)),
        _order(start + timedelta(days=60)),
        _order(start + timedelta(days=240)),  # the 180-day anomaly
        _order(start + timedelta(days=270)),  # rhythm resumes
    ]
    pred = predict_product(events, today=date(2026, 10, 1))

    # The anomaly is clipped before averaging, so the guess stays ~30 days.
    assert pred.avg_gap_days == pytest.approx(30.0)
    assert pred.median_gap_days == pytest.approx(30.0)
    assert pred.avg_gap_days < 45.0


# 5. Quantity trend ---------------------------------------------------------


def test_quantity_trend_up_down_stable():
    base = date(2026, 1, 1)
    up = [_order(base + timedelta(days=30 * i), q) for i, q in enumerate([10, 12, 14, 16, 18])]
    down = [_order(base + timedelta(days=30 * i), q) for i, q in enumerate([18, 16, 14, 12, 10])]
    wobble = [_order(base + timedelta(days=30 * i), q) for i, q in enumerate([10, 11, 10, 11, 10])]

    assert predict_product(up, today=date(2026, 5, 5)).quantity_trend == "up"
    assert predict_product(down, today=date(2026, 5, 5)).quantity_trend == "down"
    assert predict_product(wobble, today=date(2026, 5, 5)).quantity_trend == "stable"


# 6. Two orders: tenant gap blend --------------------------------------------


def test_two_order_average_blends_with_tenant_gap():
    two = [_order(date(2026, 1, 1), 10), _order(date(2026, 3, 2), 12)]  # one 60-day gap
    with_prior = predict_product(two, today=date(2026, 3, 15), tenant_gap=30.0)

    # 0.7 * own (60) + 0.3 * tenant (30) = 51 — mostly their own rhythm.
    assert with_prior.avg_gap_days == pytest.approx(0.7 * 60.0 + 0.3 * 30.0)
    # The median is the *raw* gap, unsmoothed.
    assert with_prior.median_gap_days == pytest.approx(60.0)
    assert with_prior.confidence == "low"  # only two orders => not much faith


def test_two_orders_keep_own_gap_when_no_tenant_prior():
    two = [_order(date(2026, 1, 1), 10), _order(date(2026, 3, 2), 12)]
    pred = predict_product(two, today=date(2026, 3, 15), tenant_gap=None)
    assert pred.avg_gap_days == pytest.approx(60.0)
    assert pred.median_gap_days == pytest.approx(60.0)


# Tenant-wide fallback -------------------------------------------------------


def test_tenant_average_gap_combines_all_pairs_with_history():
    pair_a = [
        _order(date(2026, 1, 1)),
        _order(date(2026, 1, 31)),
        _order(date(2026, 3, 2)),
    ]  # gaps 30 and 30
    pair_b = [
        _order(date(2026, 2, 1), product_id="p2"),
        _order(date(2026, 2, 21), product_id="p2"),
    ]  # gap 20
    thin = [_order(date(2026, 1, 1), product_id="p3")]  # only 1 order => ignored

    gap = tenant_average_gap(
        {("c1", "p1"): pair_a, ("c2", "p2"): pair_b, ("c3", "p3"): thin}
    )
    assert gap == pytest.approx((30.0 + 30.0 + 20.0) / 3.0)


def test_tenant_average_gap_is_none_when_no_pair_has_enough_history():
    one = [_order(date(2026, 1, 1))]
    assert tenant_average_gap({("c1", "p1"): one, ("c2", "p2"): one}) is None