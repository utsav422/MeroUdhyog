"""Excel and PDF exports for the GL reports.

The report services return typed payloads; this module flattens them into a
simple (title, headers, rows) table so both formats share one code path.
"""

from __future__ import annotations

import io
from decimal import Decimal

from openpyxl import Workbook
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.shared.exceptions import ValidationError


def _money(value: Decimal | None) -> str:
    return f"{Decimal(value or 0):,.2f}"


def _trial_balance(payload):
    headers = [
        "Code",
        "Account",
        "Type",
        "Opening Dr",
        "Opening Cr",
        "Period Dr",
        "Period Cr",
        "Closing Dr",
        "Closing Cr",
    ]
    rows = [
        [
            row.code,
            row.name,
            row.account_type,
            _money(row.opening_debit),
            _money(row.opening_credit),
            _money(row.period_debit),
            _money(row.period_credit),
            _money(row.closing_debit),
            _money(row.closing_credit),
        ]
        for row in payload.rows
    ]
    rows.append(
        [
            "",
            "Total",
            "",
            _money(payload.total_opening_debit),
            _money(payload.total_opening_credit),
            _money(payload.total_period_debit),
            _money(payload.total_period_credit),
            _money(payload.total_closing_debit),
            _money(payload.total_closing_credit),
        ]
    )
    return "Trial Balance", headers, rows


def _profit_loss(payload):
    headers = ["Section", "Code", "Account", "Amount"]
    rows = [
        ["Income", line.code or "", line.name, _money(line.amount)]
        for line in payload.income
    ]
    rows.append(["", "", "Total Income", _money(payload.total_income)])
    rows.extend(
        ["Expense", line.code or "", line.name, _money(line.amount)]
        for line in payload.expenses
    )
    rows.append(["", "", "Total Expenses", _money(payload.total_expenses)])
    rows.append(["", "", "Cost of Goods Sold", _money(payload.cogs)])
    rows.append(["", "", "Gross Profit", _money(payload.gross_profit)])
    rows.append(["", "", "Operating Expenses", _money(payload.operating_expenses)])
    rows.append(["", "", "Net Profit", _money(payload.net_profit)])
    return "Profit & Loss", headers, rows


def _balance_sheet(payload):
    headers = ["Section", "Code", "Account", "Amount"]
    rows = [
        ["Asset", line.code or "", line.name, _money(line.amount)]
        for line in payload.assets
    ]
    rows.append(["", "", "Total Assets", _money(payload.total_assets)])
    rows.extend(
        ["Liability", line.code or "", line.name, _money(line.amount)]
        for line in payload.liabilities
    )
    rows.append(["", "", "Total Liabilities", _money(payload.total_liabilities)])
    rows.extend(
        ["Equity", line.code or "", line.name, _money(line.amount)]
        for line in payload.equity
    )
    rows.append(["", "", "Total Equity", _money(payload.total_equity)])
    rows.append(["", "", "Difference", _money(payload.difference)])
    return "Balance Sheet", headers, rows


def _cash_flow(payload):
    headers = ["Section", "Description", "Amount"]
    rows = [
        ["Operating", line.label, _money(line.amount)]
        for line in payload.operating
    ]
    rows.append(["", "Net cash from operating activities", _money(payload.net_operating)])
    rows.extend(
        ["Investing", line.label, _money(line.amount)]
        for line in payload.investing
    )
    rows.append(["", "Net cash from investing activities", _money(payload.net_investing)])
    rows.extend(
        ["Financing", line.label, _money(line.amount)]
        for line in payload.financing
    )
    rows.append(["", "Net cash from financing activities", _money(payload.net_financing)])
    rows.append(["", "Opening cash", _money(payload.opening_cash)])
    rows.append(["", "Net change in cash", _money(payload.net_change)])
    rows.append(["", "Closing cash", _money(payload.closing_cash)])
    return "Cash Flow", headers, rows


def _day_book(payload):
    headers = [
        "Entry No",
        "Date",
        "Voucher",
        "Reference",
        "Account Code",
        "Account",
        "Debit",
        "Credit",
        "Narration",
    ]
    rows = []
    for entry in payload.entries:
        for line in entry.lines:
            rows.append(
                [
                    entry.entry_no,
                    entry.entry_date.isoformat(),
                    entry.voucher_type,
                    entry.reference or "",
                    line.account_code,
                    line.account_name,
                    _money(line.debit),
                    _money(line.credit),
                    line.description or entry.narration or "",
                ]
            )
    return "Day Book", headers, rows


def _ledger(payload):
    headers = [
        "Entry No",
        "Date",
        "Voucher",
        "Reference",
        "Debit",
        "Credit",
        "Balance",
        "Narration",
    ]
    rows = [
        [
            line.entry_no,
            line.entry_date.isoformat(),
            line.voucher_type,
            line.reference or "",
            _money(line.debit),
            _money(line.credit),
            _money(line.balance),
            line.narration or line.description or "",
        ]
        for line in payload.lines
    ]
    rows.append(
        [
            "",
            "",
            "",
            "Closing balance",
            _money(payload.total_debit),
            _money(payload.total_credit),
            _money(payload.closing_balance),
            "",
        ]
    )
    return f"Ledger - {payload.code} {payload.name}", headers, rows


def _party_statement(payload):
    headers = [
        "Entry No",
        "Date",
        "Voucher",
        "Reference",
        "Debit",
        "Credit",
        "Balance",
        "Narration",
    ]
    rows = [
        [
            line.entry_no,
            line.entry_date.isoformat(),
            line.voucher_type,
            line.reference or "",
            _money(line.debit),
            _money(line.credit),
            _money(line.balance),
            line.narration or "",
        ]
        for line in payload.lines
    ]
    rows.append(
        [
            "",
            "",
            "",
            "Closing balance",
            _money(payload.total_debit),
            _money(payload.total_credit),
            _money(payload.closing_balance),
            "",
        ]
    )
    return f"Party Statement - {payload.party_name}", headers, rows


def _aging(payload):
    headers = [
        "Party",
        "0-30 days",
        "31-60 days",
        "61-90 days",
        "90+ days",
        "Total",
        "Credit balance",
    ]
    rows = [
        [
            row.party_name,
            _money(row.current),
            _money(row.days_31_60),
            _money(row.days_61_90),
            _money(row.days_over_90),
            _money(row.total),
            _money(row.credit_balance),
        ]
        for row in payload.rows
    ]
    rows.append(
        [
            "Total",
            _money(payload.totals.current),
            _money(payload.totals.days_31_60),
            _money(payload.totals.days_61_90),
            _money(payload.totals.days_over_90),
            _money(payload.totals.total),
            _money(payload.totals.credit_balance),
        ]
    )
    return "Receivables Aging", headers, rows


def _tax_summary(payload):
    headers = [
        "Period",
        "Output VAT",
        "Input VAT",
        "Net Payable",
        "TDS Receivable",
        "TDS Payable",
        "Net TDS",
    ]
    rows = [
        [
            line.period,
            _money(line.output_vat),
            _money(line.input_vat),
            _money(line.net_payable),
            _money(line.tds_receivable),
            _money(line.tds_payable),
            _money(line.net_tds),
        ]
        for line in payload.lines
    ]
    rows.append(
        [
            "Total",
            _money(payload.output_vat),
            _money(payload.input_vat),
            _money(payload.net_payable),
            _money(payload.tds_receivable),
            _money(payload.tds_payable),
            _money(payload.net_tds),
        ]
    )
    return "Tax Summary", headers, rows


_BUILDERS = {
    "trial-balance": _trial_balance,
    "profit-loss": _profit_loss,
    "balance-sheet": _balance_sheet,
    "cash-flow": _cash_flow,
    "day-book": _day_book,
    "ledger": _ledger,
    "party-statement": _party_statement,
    "aging": _aging,
    "tax-summary": _tax_summary,
}


def report_table(report: str, payload) -> tuple[str, list[str], list[list[str]]]:
    builder = _BUILDERS.get(report)
    if builder is None:
        raise ValidationError(f"Unknown report: {report}")
    return builder(payload)


def build_xlsx(title: str, headers: list[str], rows: list[list[str]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = title[:31]
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    for row in rows:
        sheet.append(row)
    for column in sheet.columns:
        width = max(len(str(cell.value or "")) for cell in column)
        sheet.column_dimensions[column[0].column_letter].width = min(
            max(width + 2, 10), 40
        )
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def build_pdf(title: str, headers: list[str], rows: list[list[str]]) -> bytes:
    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=24,
        rightMargin=24,
        topMargin=24,
        bottomMargin=24,
        title=title,
    )
    styles = getSampleStyleSheet()
    elements = [Paragraph(title, styles["Title"]), Spacer(1, 12)]
    table = Table([headers, *rows], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ]
        )
    )
    elements.append(table)
    document.build(elements)
    return buffer.getvalue()
