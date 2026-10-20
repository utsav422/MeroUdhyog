from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

# ---- trial balance --------------------------------------------------------------

class TrialBalanceRow(BaseModel):
    account: str
    code: str
    account_type: str  # asset | liability | equity | income | expense
    debit: Decimal
    credit: Decimal


class TrialBalanceResponse(BaseModel):
    as_of: date | None
    rows: list[TrialBalanceRow]
    total_debit: Decimal
    total_credit: Decimal
    balanced: bool


# ---- profit & loss --------------------------------------------------------------

class PLLine(BaseModel):
    label: str
    amount: Decimal
    key: str | None = None


class ProfitLossResponse(BaseModel):
    date_from: date | None
    date_to: date | None
    revenue: Decimal
    cogs: Decimal
    gross_profit: Decimal
    operating_expenses: Decimal
    net_profit: Decimal
    gross_margin_pct: Decimal
    net_margin_pct: Decimal
    cogs_basis: str  # "cost_price" | "purchases"
    lines: list[PLLine]


# ---- balance sheet --------------------------------------------------------------

class BalanceSheetLine(BaseModel):
    label: str
    amount: Decimal


class BalanceSheetResponse(BaseModel):
    as_of: date | None
    assets: list[BalanceSheetLine]
    liabilities: list[BalanceSheetLine]
    equity: list[BalanceSheetLine]
    total_assets: Decimal
    total_liabilities: Decimal
    total_equity: Decimal
    balanced: bool
    retained_earnings: Decimal
    difference: Decimal


# ---- cash flow ------------------------------------------------------------------

class CashFlowLine(BaseModel):
    label: str
    amount: Decimal


class CashFlowResponse(BaseModel):
    date_from: date | None
    date_to: date | None
    operating: list[CashFlowLine]
    investing: list[CashFlowLine]
    financing: list[CashFlowLine]
    net_operating: Decimal
    net_investing: Decimal
    net_financing: Decimal
    opening_cash: Decimal
    net_change: Decimal
    closing_cash: Decimal


# ---- settings -------------------------------------------------------------------

class AccountingSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    business_name: str | None
    fiscal_year_start_month: int
    book_start_date: date | None
    opening_cash: Decimal
    opening_receivables: Decimal
    opening_inventory: Decimal
    opening_other_assets: Decimal
    opening_payables: Decimal
    opening_loans: Decimal
    opening_capital: Decimal
    currency: str


class AccountingSettingsUpdate(BaseModel):
    business_name: str | None = None
    fiscal_year_start_month: int | None = Field(default=None, ge=1, le=12)
    book_start_date: date | None = None
    opening_cash: Decimal | None = None
    opening_receivables: Decimal | None = None
    opening_inventory: Decimal | None = None
    opening_other_assets: Decimal | None = None
    opening_payables: Decimal | None = None
    opening_loans: Decimal | None = None
    opening_capital: Decimal | None = None
    currency: str | None = None
