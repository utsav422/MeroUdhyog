"""CSV parsing for order-history imports.

The file contains one row per order event for a single, pre-selected
product + customer pair: the order date and the quantity. The product,
variant and customer are chosen in the UI before upload — they are NOT part
of the CSV.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.shared.csv_import import CsvRow, parse_csv_rows

ALL_COLUMNS = ("order_date", "quantity")
MANDATORY_COLUMNS = ("order_date", "quantity")

SAMPLE_HEADER = "order_date*,quantity*"


def _normalise(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _parse_date(value: str | None) -> datetime | None:
    if value is None:
        return None
    raw = value.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _parse_quantity(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        qty = float(value)
    except ValueError:
        return None
    if qty <= 0:
        return None
    return value.strip()


def parse_order_history_csv(content: bytes):
    """Return ``(rows, fatal_error)`` for a two-column order-date/quantity CSV.

    ``rows`` are ``CsvRow`` objects whose ``data`` holds cleaned
    ``{order_date, quantity}`` values. ``order_date``/``quantity`` may be
    missing when their raw values are unparseable — the caller reports those
    as row errors.
    """
    rows, fatal = parse_csv_rows(content, ALL_COLUMNS, MANDATORY_COLUMNS)
    if fatal:
        return [], fatal

    cleaned: list[CsvRow] = []
    for row in rows:
        data = dict(row.data)
        date_str = _normalise(data.get("order_date"))
        qty_str = _normalise(data.get("quantity"))
        parsed_date = _parse_date(date_str)
        parsed_qty = _parse_quantity(qty_str)
        if parsed_date is not None:
            data["order_date"] = parsed_date.isoformat()
        else:
            data.pop("order_date", None)
        if parsed_qty is not None:
            data["quantity"] = parsed_qty
        else:
            data.pop("quantity", None)
        cleaned.append(CsvRow(row_number=row.row_number, data=data))
    return cleaned, None


def build_sample_csv() -> str:
    """A ready-to-upload sample file — just dates and quantities."""
    lines = [
        SAMPLE_HEADER,
        "2026-06-15,50",
        "2026-07-15,60",
        "2026-08-14,55",
    ]
    return "\n".join(lines) + "\n"