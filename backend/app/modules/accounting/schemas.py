from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

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
    report_engine: str


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
    report_engine: Literal["legacy", "gl"] | None = None


# ---- general ledger -------------------------------------------------------------


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    account_type: str
    normal_balance: str
    parent_id: UUID | None
    is_group: bool
    is_system: bool
    is_active: bool
    description: str | None


class AccountCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=200)
    account_type: Literal["asset", "liability", "equity", "income", "expense"]
    normal_balance: Literal["debit", "credit"] | None = None
    parent_id: UUID | None = None
    is_group: bool = False
    description: str | None = Field(default=None, max_length=1000)


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    parent_id: UUID | None = None
    is_active: bool | None = None
    description: str | None = Field(default=None, max_length=1000)


class JournalLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_id: UUID
    line_no: int
    debit: Decimal
    credit: Decimal
    description: str | None
    party_type: str | None
    party_id: UUID | None


class JournalEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    entry_no: str
    entry_date: date
    voucher_type: str
    reference: str | None
    narration: str | None
    source_type: str | None
    source_id: UUID | None
    status: str
    currency: str
    reversal_of_id: UUID | None
    created_at: datetime
    lines: list[JournalLineRead] = Field(default_factory=list)


class JournalLineCreate(BaseModel):
    account_id: UUID
    debit: Decimal = Field(default=Decimal("0"), ge=0)
    credit: Decimal = Field(default=Decimal("0"), ge=0)
    description: str | None = Field(default=None, max_length=500)
    party_type: str | None = Field(default=None, max_length=20)
    party_id: UUID | None = None


class JournalEntryCreate(BaseModel):
    entry_date: date
    voucher_type: Literal[
        "journal", "contra", "adjustment", "payment", "receipt"
    ] = "journal"
    reference: str | None = Field(default=None, max_length=100)
    narration: str | None = Field(default=None, max_length=1000)
    lines: list[JournalLineCreate] = Field(min_length=2)


class ReconciliationLine(BaseModel):
    check: str
    gl_amount: Decimal
    legacy_amount: Decimal
    difference: Decimal
    status: str  # matched | difference | informational
    note: str | None = None


class ReconciliationResponse(BaseModel):
    tenant_id: UUID
    date_from: date | None
    date_to: date | None
    transactions_total: int
    transactions_posted: int
    transactions_unpostable: int
    transactions_missing: int
    duplicate_active_entries: int
    unbalanced_entries: int
    lines: list[ReconciliationLine]
    notes: list[str] = Field(default_factory=list)


# ---- GL reports -----------------------------------------------------------------


class GLReportLine(BaseModel):
    account_id: UUID | None = None
    code: str | None = None
    name: str
    amount: Decimal


class GLTrialBalanceRow(BaseModel):
    account_id: UUID
    code: str
    name: str
    account_type: str
    normal_balance: str
    opening_debit: Decimal
    opening_credit: Decimal
    period_debit: Decimal
    period_credit: Decimal
    closing_debit: Decimal
    closing_credit: Decimal


class GLTrialBalanceResponse(BaseModel):
    date_from: date | None
    date_to: date | None
    rows: list[GLTrialBalanceRow]
    total_opening_debit: Decimal
    total_opening_credit: Decimal
    total_period_debit: Decimal
    total_period_credit: Decimal
    total_closing_debit: Decimal
    total_closing_credit: Decimal
    balanced: bool


class GLProfitLossResponse(BaseModel):
    date_from: date | None
    date_to: date | None
    income: list[GLReportLine]
    expenses: list[GLReportLine]
    total_income: Decimal
    cogs: Decimal
    gross_profit: Decimal
    operating_expenses: Decimal
    total_expenses: Decimal
    net_profit: Decimal


class GLBalanceSheetResponse(BaseModel):
    as_of: date | None
    assets: list[GLReportLine]
    liabilities: list[GLReportLine]
    equity: list[GLReportLine]
    total_assets: Decimal
    total_liabilities: Decimal
    total_equity: Decimal
    current_earnings: Decimal
    difference: Decimal
    balanced: bool


class GLCashFlowLine(BaseModel):
    label: str
    amount: Decimal


class GLCashFlowResponse(BaseModel):
    date_from: date | None
    date_to: date | None
    operating: list[GLCashFlowLine]
    investing: list[GLCashFlowLine]
    financing: list[GLCashFlowLine]
    net_operating: Decimal
    net_investing: Decimal
    net_financing: Decimal
    opening_cash: Decimal
    net_change: Decimal
    closing_cash: Decimal
    balanced: bool


class GLDayBookLine(BaseModel):
    line_no: int
    account_id: UUID
    account_code: str
    account_name: str
    debit: Decimal
    credit: Decimal
    description: str | None
    party_type: str | None
    party_id: UUID | None


class GLDayBookEntry(BaseModel):
    id: UUID
    entry_no: str
    entry_date: date
    voucher_type: str
    reference: str | None
    narration: str | None
    status: str
    source_type: str | None
    source_id: UUID | None
    lines: list[GLDayBookLine]


class GLDayBookResponse(BaseModel):
    date_from: date | None
    date_to: date | None
    count: int
    entries: list[GLDayBookEntry]


class GLLedgerLine(BaseModel):
    entry_id: UUID
    entry_no: str
    entry_date: date
    voucher_type: str
    reference: str | None
    narration: str | None
    description: str | None
    debit: Decimal
    credit: Decimal
    balance: Decimal


class GLLedgerResponse(BaseModel):
    account_id: UUID
    code: str
    name: str
    account_type: str
    normal_balance: str
    date_from: date | None
    date_to: date | None
    opening_balance: Decimal
    total_debit: Decimal
    total_credit: Decimal
    closing_balance: Decimal
    lines: list[GLLedgerLine]


class GLPartyStatementLine(BaseModel):
    entry_id: UUID
    entry_no: str
    entry_date: date
    voucher_type: str
    reference: str | None
    narration: str | None
    debit: Decimal
    credit: Decimal
    balance: Decimal


class GLPartyStatementResponse(BaseModel):
    party_type: str
    party_id: UUID | None
    party_name: str
    account_code: str
    date_from: date | None
    date_to: date | None
    opening_balance: Decimal
    total_debit: Decimal
    total_credit: Decimal
    closing_balance: Decimal
    lines: list[GLPartyStatementLine]


class GLAgingRow(BaseModel):
    party_id: UUID | None
    party_name: str
    current: Decimal
    days_31_60: Decimal
    days_61_90: Decimal
    days_over_90: Decimal
    total: Decimal
    credit_balance: Decimal


class GLAgingBucket(BaseModel):
    label: str
    amount: Decimal


class GLAgingResponse(BaseModel):
    as_of: date
    rows: list[GLAgingRow]
    totals: GLAgingRow
    buckets: list[GLAgingBucket]


class GLTaxSummaryLine(BaseModel):
    period: str
    output_vat: Decimal
    input_vat: Decimal
    net_payable: Decimal
    tds_receivable: Decimal
    tds_payable: Decimal
    net_tds: Decimal


class GLTaxSummaryResponse(BaseModel):
    date_from: date | None
    date_to: date | None
    output_vat: Decimal
    input_vat: Decimal
    net_payable: Decimal
    tds_receivable: Decimal
    tds_payable: Decimal
    net_tds: Decimal
    lines: list[GLTaxSummaryLine]


# ---- periods and audit trail ----------------------------------------------------


class FiscalYearCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    start_date: date
    end_date: date
    generate_periods: bool = True


class FiscalYearRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    start_date: date
    end_date: date
    is_closed: bool
    closed_at: datetime | None


class AccountingPeriodRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    fiscal_year_id: UUID
    name: str
    start_date: date
    end_date: date
    is_closed: bool
    closed_at: datetime | None
    closed_by: UUID | None


class PeriodActionRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    entity_type: str
    entity_id: UUID
    action: str
    actor_id: UUID | None
    before: dict | None
    after: dict | None
    reason: str | None
    created_at: datetime


# ---- bank accounts and reconciliation ------------------------------------------


class BankAccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    bank_name: str | None = Field(default=None, max_length=100)
    account_number: str | None = Field(default=None, max_length=50)
    currency: str = Field(default="NPR", min_length=3, max_length=3)
    gl_account_id: UUID
    opening_balance: Decimal = Decimal("0")
    is_active: bool = True


class BankAccountRead(BaseModel):
    id: UUID
    name: str
    bank_name: str | None
    account_number: str | None
    currency: str
    gl_account_id: UUID
    gl_account_code: str | None = None
    gl_account_name: str | None = None
    opening_balance: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BankStatementLineCreate(BaseModel):
    statement_date: date
    description: str | None = Field(default=None, max_length=500)
    reference: str | None = Field(default=None, max_length=100)
    amount: Decimal


class BankStatementImport(BaseModel):
    lines: list[BankStatementLineCreate] = Field(min_length=1, max_length=1000)


class BankStatementLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    bank_account_id: UUID
    statement_date: date
    description: str | None
    reference: str | None
    amount: Decimal
    status: str
    matched_entry_id: UUID | None
    matched_line_id: UUID | None
    matched_at: datetime | None
    matched_by: UUID | None
    created_at: datetime


class BankMatchRequest(BaseModel):
    journal_line_id: UUID


class BankAutoMatchRequest(BaseModel):
    date_window_days: int = Field(default=3, ge=0, le=30)


class BankAutoMatchResponse(BaseModel):
    matched: int
    unmatched: int
    lines: list[BankStatementLineRead]


class BankReconciliationResponse(BaseModel):
    bank_account_id: UUID
    name: str
    gl_account_id: UUID
    gl_account_code: str
    date_from: date | None
    date_to: date | None
    opening_balance: Decimal
    statement_total: Decimal
    statement_balance: Decimal
    book_balance: Decimal
    matched_total: Decimal
    unmatched_total: Decimal
    difference: Decimal
    balanced: bool
    lines: list[BankStatementLineRead]


# ---- inventory reconciliation ---------------------------------------------------


class InventoryReconciliationRow(BaseModel):
    variant_id: UUID
    product_id: UUID
    product_name: str
    variant_name: str
    sku: str | None
    quantity: int
    unit_cost: Decimal
    value: Decimal


class InventoryReconciliationResponse(BaseModel):
    as_of: date | None
    gl_inventory: Decimal
    stock_value: Decimal
    difference: Decimal
    balanced: bool
    rows: list[InventoryReconciliationRow]
