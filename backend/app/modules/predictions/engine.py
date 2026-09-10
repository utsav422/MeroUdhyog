"""Statistical prediction engine for customer reorder behaviour.

Each (customer, product) pair is analysed independently.  We look at the
gaps (in days) between a customer's consecutive orders to answer four
questions the sales team actually cares about:

  * When is this customer next likely to order?
  * How interested do they seem right now?  (0-100)
  * Is that "due soon", already "overdue", or comfortably "on track"?
  * Should we CALL, MESSAGE, or simply WAIT?

Every function is pure: it only does arithmetic over the data it is
given.  There is no database access and no I/O, so the whole file is
trivially unit-testable.

The design notes hidden below assume the reader already understands the
business: "customer" buys a product repeatedly, and the time between
consecutive purchases (the *gap*) is the signal we model.  A customer
with a regular, predictable gap is worth acting on; an erratic one is a
coin flip and we should not over-invest the sales team's time in them.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from statistics import median, stdev


@dataclass
class OrderEvent:
    """A single order event for one (customer, product) pair.

    Only the fields listed here exist.  ``order_date`` is a calendar
    ``date`` (not a full datetime) because the engine reasons in whole
    days, not timestamps.
    """

    product_id: str
    product_name: str
    order_date: date
    quantity: float
    variant_id: str | None = None
    variant_name: str | None = None
    sku: str | None = None


@dataclass
class ProductPrediction:
    """The computed forecast for one (customer, product) pair.

    ``service.py`` reads these fields directly to build its API response,
    so the names below are a public contract and must not be renamed.
    """

    product_id: str
    product_name: str
    sku: str | None
    variant_id: str | None
    variant_name: str | None
    order_count: int
    last_order_date: date | None
    avg_gap_days: float | None
    median_gap_days: float | None
    next_order_date: date | None
    days_until_next: int | None
    interest_score: int
    avg_quantity: float
    quantity_trend: str | None
    stock_status: str
    days_of_stock: float | None
    confidence: str
    recommendation: str


# --- Small numeric helpers -----------------------------------------------


def _clamp(value: float, low: float, high: float) -> float:
    """Keep ``value`` inside the inclusive [low, high] band."""
    return max(low, min(high, value))


def _weighted_mean(values: list[float], weights: list[float]) -> float:
    """Weighted average: recent values carry more importance than old ones."""
    return sum(v * w for v, w in zip(values, weights, strict=True)) / sum(weights)


def _recency_weights(count: int, decay: float = 0.7) -> list[float]:
    """Exponential weights that favour the most recent item.

    The newest item gets weight 1.0, each step older is multiplied by
    ``decay`` (0.7).  This is like a short memory: the last interval and
    the last quantity say more about the future than the distant past.
    """
    return [decay ** (count - 1 - i) for i in range(count)]


# --- Per-pair prediction --------------------------------------------------


def predict_product(
    events: list[OrderEvent],
    today: date,
    tenant_gap: float | None = None,
) -> ProductPrediction:
    """Forecast one (customer, product) pair.

    ``events`` must already be sorted ascending by ``order_date`` —
    ``service.py`` guarantees this before handing the list over.

    ``tenant_gap`` is the tenant-wide average reorder gap (days) used as
    a gentle prior for pairs that only have one real gap of their own.
    """
    order_count = len(events)

    # ------------------------------------------------------------------
    # Too little history to do any real statistics.
    # ------------------------------------------------------------------
    # With 0 or 1 order we cannot measure a reorder rhythm, so there is
    # nothing to classify beyond "we don't know enough yet".  We return
    # a minimal, safe prediction: insufficient_data/low confidence/wait.
    # The one thing we can still say is the size of the last order and a
    # small "interest" score that grows slightly when the order is fresh.
    if order_count < 2:
        return _predict_thin_history(events, today)

    # Distinct order dates guarantee gaps of at least 1 day.  Collapsing
    # same-day line items happens upstream in service.py, so consecutive
    # events here have genuinely different dates.
    dates = [e.order_date for e in events]
    quantities = [e.quantity for e in events]
    last_order_date = dates[-1]
    latest_quantity = quantities[-1]

    # The gap between order i-1 and order i, in whole days.
    raw_gaps = [float((dates[i] - dates[i - 1]).days) for i in range(1, order_count)]
    median_gap_days = float(median(raw_gaps))

    # ------------------------------------------------------------------
    # Outlier guard on the AVERAGE gap.
    # ------------------------------------------------------------------
    # A single detached gap (a holiday shutdown, a stock-out, a customer
    # who vanished for months) can mathematically dominate an average and
    # claim the customer is far slower than they really are.  Any gap more
    # than 3x the median is treated as that kind of anomaly and clipped
    # down to the median so the *average* is not dragged off.  The raw
    # gaps are still used to measure consistency below, so genuinely
    # erratic buyers never get mistaken for reliable ones.
    anomaly_ceiling = 3.0 * median_gap_days
    avg_gaps = [
        median_gap_days if gap > anomaly_ceiling else gap for gap in raw_gaps
    ]

    if order_count == 2:
        # A single gap is noisy (one data point "is" the rhythm), so we
        # blend it with the tenant-wide average: mostly the customer's own
        # gap, lightly nudged toward how the tenant as a whole behaves.
        own_gap = raw_gaps[0]
        if tenant_gap is not None and tenant_gap > 0:
            avg_gap_days = 0.7 * own_gap + 0.3 * tenant_gap
        else:
            avg_gap_days = own_gap
        # With only one gap there is no spread to measure => perfectly
        # regular by definition.
        coefficient_of_variation = 0.0
    else:
        weights = _recency_weights(len(avg_gaps))
        avg_gap_days = _weighted_mean(avg_gaps, weights)
        # Coefficient of variation = standard deviation / mean.  It is the
        # classic "how regular is the cadence" measure: 0 means perfectly
        # regular, anything above ~0.6 means hard to predict.
        coefficient_of_variation = (
            stdev(raw_gaps) / avg_gap_days if avg_gap_days > 0 else 0.0
        )

    # ------------------------------------------------------------------
    # When do we expect the next order, and what does that mean today?
    # ------------------------------------------------------------------
    next_order_date = last_order_date + timedelta(days=avg_gap_days)
    days_until_next = (next_order_date - today).days

    if days_until_next < 0:
        # They were expected already and have not ordered.
        stock_status = "overdue"
    elif days_until_next <= max(3.0, 0.3 * avg_gap_days):
        # Due very soon: within a few days, or within 30% of their own cadence.
        stock_status = "due_soon"
    else:
        stock_status = "on_track"

    # "Days of stock" is shorthand for how much runway we have before the
    # customer is expected to need more product.  It only makes sense when
    # they are not yet overdue.
    days_of_stock = (
        None if stock_status == "overdue" else float(days_until_next)
    )

    # ------------------------------------------------------------------
    # Typical order size and whether it is creeping up or down.
    # ------------------------------------------------------------------
    # Same exponential weighting as the gaps, but only over the most
    # recent 5 orders — older quantities tell us little about the trend
    # the customer is on right now.
    recent_quantities = [float(q) for q in quantities[-5:]]
    q_weights = _recency_weights(len(recent_quantities))
    avg_quantity = _weighted_mean(recent_quantities, q_weights)

    # A +-10% tolerance band around the baseline: only a real movement
    # (bigger/smaller than 10%) counts as a trend; anything inside is just
    # normal wobble.
    band = 0.10 * avg_quantity
    if latest_quantity > avg_quantity + band:
        quantity_trend = "up"
    elif latest_quantity < avg_quantity - band:
        quantity_trend = "down"
    else:
        quantity_trend = "stable"

    # ------------------------------------------------------------------
    # How much can we trust this forecast?
    # ------------------------------------------------------------------
    # Confidence follows two things: how many orders we have seen, and how
    # regular the spacing was.  Lots of orders with a steady rhythm = high
    # faith; a couple of orders or wildly uneven gaps = low faith.  And no
    # matter how many orders exist, a truly erratic buyer is capped at
    # "low" — they are not worth betting a phone call on.
    if coefficient_of_variation > 0.75:
        confidence = "low"
    elif order_count >= 5 and coefficient_of_variation < 0.3:
        confidence = "high"
    elif order_count < 3 or coefficient_of_variation > 0.6:
        confidence = "low"
    else:
        confidence = "medium"

    # ------------------------------------------------------------------
    # Interest score (0-100): how warm is this lead right now?
    # ------------------------------------------------------------------
    # Three equally understandable signals combined into one number, each
    # worth 0-100:
    #   * recency     (40%): the closer the expected next order, the more
    #                        urgent and recommendable it is.
    #   * frequency   (30%): the more often they order, the more business
    #                        they represent (scaled up to 8+ orders).
    #   * consistency (30%): the more regular their cadence, the more we
    #                        can rely on the timing forecast.
    if avg_gap_days > 0:
        recency_score = _clamp(
            100.0 - (days_until_next / avg_gap_days) * 100.0, 0.0, 100.0
        )
    else:
        recency_score = 100.0
    frequency_score = min(1.0, order_count / 8.0) * 100.0
    consistency_score = _clamp(100.0 - coefficient_of_variation * 100.0, 0.0, 100.0)

    interest_score = round(
        0.4 * recency_score + 0.3 * frequency_score + 0.3 * consistency_score
    )
    interest_score = int(_clamp(interest_score, 0.0, 100.0))

    # ------------------------------------------------------------------
    # What should the team actually do?
    # ------------------------------------------------------------------
    # Overdue + trustworthy forecast => call (real money is late).
    # Overdue + shaky forecast => message (cheap nudge, low cost if wrong).
    # Due very soon => message.  Everything else => wait.
    if stock_status == "overdue":
        recommendation = (
            "call" if confidence in {"high", "medium"} else "message"
        )
    elif stock_status == "due_soon":
        recommendation = "message"
    else:
        recommendation = "wait"

    return ProductPrediction(
        product_id=events[0].product_id,
        product_name=events[0].product_name,
        sku=events[0].sku,
        variant_id=events[0].variant_id,
        variant_name=events[0].variant_name,
        order_count=order_count,
        last_order_date=last_order_date,
        avg_gap_days=avg_gap_days,
        median_gap_days=median_gap_days,
        next_order_date=next_order_date,
        days_until_next=days_until_next,
        interest_score=interest_score,
        avg_quantity=avg_quantity,
        quantity_trend=quantity_trend,
        stock_status=stock_status,
        days_of_stock=days_of_stock,
        confidence=confidence,
        recommendation=recommendation,
    )


def _predict_thin_history(events: list[OrderEvent], today: date) -> ProductPrediction:
    """Minimal, safe prediction for a pair with fewer than 2 orders.

    Everything descriptive (gaps, next date, trend) is ``None`` because
    there is no history to measure it from.  The score stays small
    (roughly 10-20) and rises slightly if the single order was recent, on
    the theory that a customer who just bought is mildly more interested
    than one who bought long ago.
    """
    if not events:
        return ProductPrediction(
            product_id="",
            product_name="",
            sku=None,
            variant_id=None,
            variant_name=None,
            order_count=0,
            last_order_date=None,
            avg_gap_days=None,
            median_gap_days=None,
            next_order_date=None,
            days_until_next=None,
            interest_score=12,
            avg_quantity=0.0,
            quantity_trend=None,
            stock_status="insufficient_data",
            days_of_stock=None,
            confidence="low",
            recommendation="wait",
        )

    event = events[0]
    days_since_last = max((today - event.order_date).days, 0)
    recency_boost = max(0.0, 8.0 - days_since_last / 15.0)
    interest = round(_clamp(12.0 + recency_boost, 0.0, 100.0))

    return ProductPrediction(
        product_id=event.product_id,
        product_name=event.product_name,
        sku=event.sku,
        variant_id=event.variant_id,
        variant_name=event.variant_name,
        order_count=1,
        last_order_date=event.order_date,
        avg_gap_days=None,
        median_gap_days=None,
        next_order_date=None,
        days_until_next=None,
        interest_score=interest,
        avg_quantity=event.quantity,
        quantity_trend=None,
        stock_status="insufficient_data",
        days_of_stock=None,
        confidence="low",
        recommendation="wait",
    )


# --- Tenant-wide fallback cadence -----------------------------------------


def tenant_average_gap(
    events_by_pair: dict[tuple[str, str], list[OrderEvent]],
) -> float | None:
    """Average reorder gap (in days) across every pair with 2+ orders.

    This is the tenant's overall ordering rhythm, used as a prior when a
    specific (customer, product) pair only has a single gap of its own.
    Pairs with fewer than two orders contribute nothing — they have no
    inter-order gap to measure.  Returns ``None`` when no pair anywhere
    has enough history to compute even one gap.
    """
    all_gaps: list[float] = []
    for events in events_by_pair.values():
        if len(events) < 2:
            continue
        ordered = sorted(e.order_date for e in events)
        all_gaps.extend(
            float((ordered[i] - ordered[i - 1]).days) for i in range(1, len(ordered))
        )
    if not all_gaps:
        return None
    return sum(all_gaps) / len(all_gaps)