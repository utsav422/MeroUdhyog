"""Parse CSV/XLSX files into normalized transaction import rows.

Column headers are matched case-insensitively against a set of common aliases
so users can upload files with their own column names.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any

HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "type": ("type", "transaction_type", "txn_type", "kind"),
    "transaction_date": (
        "transaction_date",
        "date",
        "txn_date",
        "timestamp",
        "posted_on",
        "posting_date",
    ),
    "external_id": (
        "external_id",
        "externalid",
        "reference",
        "ref",
        "invoice_no",
        "invoice_number",
        "invoice",
    ),
    "amount": ("amount", "total", "total_amount", "amount_total", "value"),
    "customer_email": ("customer_email", "customer", "email", "customer_email_address", "account"),
    "product_sku": ("product_sku", "product", "sku", "item", "item_sku"),
    "quantity": ("quantity", "qty", "count", "units"),
    "unit_price": ("unit_price", "unitprice", "unit price", "price", "unit_cost"),
    "tax_amount": ("tax_amount", "tax", "tax_amount_total", "vat"),
    "discount_amount": ("discount_amount", "discount", "disc"),
    "currency": ("currency", "cur", "ccy"),
    "description": ("description", "notes", "memo", "details", "comment"),
    "customer_name": ("customer_name", "name", "party"),
}

# Canonical field -> import row field name.
_FIELD_ALIASES: dict[str, tuple[str, ...]] = dict(HEADER_ALIASES)


def _normalise_header(value: Any) -> str | None:
    if value is None:
        return None
    return str(value).strip().lower().replace(" ", "")


def map_headers(raw_headers: list[Any]) -> dict[int, str]:
    """Return {column_index: canonical_field} for recognised headers."""
    mapping: dict[int, str] = {}
    for idx, raw in enumerate(raw_headers):
        h = _normalise_header(raw)
        if not h:
            continue
        for field, aliases in _FIELD_ALIASES.items():
            if h == field or h in (a.replace(" ", "") for a in aliases):
                mapping[idx] = field
                break
    return mapping


def parse_date(value: Any) -> str | None:
    """Return an ISO-8601 datetime string (UTC naive) or None."""
    if value is None or str(value).strip() == "":
        return None
    raw = str(value).strip()
    for fmt in (
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
        "%d-%m-%Y",
    ):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.replace(hour=12).isoformat()
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(raw)
        return dt.isoformat()
    except ValueError:
        return None


def _strip(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _rows_to_dicts(rows: list[list[Any]], mapping: dict[int, str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        record: dict[str, Any] = {}
        for idx, field in mapping.items():
            if idx < len(row):
                val = _strip(row[idx])
                if val is not None:
                    record[field] = val
        if "transaction_date" in record:
            iso = parse_date(record["transaction_date"])
            if iso:
                record["transaction_date"] = iso
            else:
                record.pop("transaction_date", None)
        if record:
            out.append(record)
    return out


def parse_csv(content: bytes) -> list[dict[str, Any]]:
    text = content.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        raise ValueError("The CSV file is empty.")
    header = rows[0]
    data = [r for r in rows[1:] if r]
    mapping = map_headers(header)
    if not mapping:
        raise ValueError(
            "No recognised columns found in the CSV header. Expected at least a "
            "'type' and 'amount' column (e.g. type, transaction_date, amount)."
        )
    return _rows_to_dicts(data, mapping)


def parse_xlsx(content: bytes) -> list[dict[str, Any]]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    it = ws.iter_rows(values_only=True)
    try:
        header = next(it)
    except StopIteration:
        raise ValueError("The XLSX file is empty.") from None
    rows = [list(r) for r in it]
    mapping = map_headers(list(header))
    if not mapping:
        raise ValueError(
            "No recognised columns found in the XLSX header. Expected at least a "
            "'type' and 'amount' column (e.g. type, transaction_date, amount)."
        )
    wb.close()
    return _rows_to_dicts(rows, mapping)


def parse_import_file(filename: str, content: bytes) -> list[dict[str, Any]]:
    lower = filename.lower()
    if lower.endswith(".xlsx"):
        return parse_xlsx(content)
    if lower.endswith(".csv"):
        return parse_csv(content)
    raise ValueError(
        "Unsupported file type. Please upload a .csv or .xlsx file."
    )
