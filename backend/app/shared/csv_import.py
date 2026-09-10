"""Reusable CSV parsing helpers for bulk import endpoints.

Headers are case-insensitive, spaces are ignored, and a trailing ``*`` marks
a required/mandatory column (e.g. ``name*``) in the downloadable samples.
"""

from __future__ import annotations

import csv
import io


class CsvRow:
    """One parsed data row, keeping the row number it came from.

    ``error`` is filled in later by the caller (validation/duplicate check)
    while ``data`` holds the clean ``{column: value}`` mapping.
    """

    __slots__ = ("row_number", "data", "error")

    def __init__(
        self,
        row_number: int,
        data: dict[str, str] | None = None,
        error: str | None = None,
    ) -> None:
        self.row_number = row_number
        self.data = data or {}
        self.error = error


def _normalise_header(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip().lower().replace(" ", "").rstrip("*")


def _strip(value: object) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def parse_csv_rows(
    content: bytes,
    all_columns: tuple[str, ...],
    mandatory_columns: tuple[str, ...],
) -> tuple[list[CsvRow], str | None]:
    """Return ``(rows, fatal_error)``.

    ``rows`` keep their original 1-based spreadsheet row numbers so errors can
    be shown to the user. A ``fatal_error`` is returned when the file cannot
    be read, is empty, or a required column is missing.
    """
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return [], "Unreadable file. Please save and re-upload the file as UTF-8 CSV."
    try:
        reader = csv.reader(io.StringIO(text))
        raw_rows = [r for r in reader if any(cell and cell.strip() for cell in r)]
    except csv.Error:
        return [], "Could not parse the CSV file."
    if not raw_rows:
        return [], "The CSV file is empty."

    headers = [_normalise_header(h) for h in raw_rows[0]]
    mapping: dict[int, str] = {}
    for idx, name in enumerate(headers):
        if name in all_columns and name not in mapping.values():
            mapping[idx] = name

    missing = [c for c in mandatory_columns if c not in mapping.values()]
    if missing:
        return [], (
            "Missing required column(s): "
            + ", ".join(f"{c}*" for c in missing)
            + ". Required columns: "
            + ", ".join(f"{c}*" for c in mandatory_columns)
            + "."
        )

    rows: list[CsvRow] = []
    for pos, raw in enumerate(raw_rows[1:], start=2):
        record: dict[str, str] = {}
        for idx, column in mapping.items():
            value = _strip(raw[idx]) if idx < len(raw) else None
            if value is not None:
                record[column] = value
        rows.append(CsvRow(row_number=pos, data=record))
    return rows, None