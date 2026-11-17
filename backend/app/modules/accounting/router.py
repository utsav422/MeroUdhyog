from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.core.dependencies import (
    get_current_tenant_id,
    get_current_user_id,
    get_db,
)
from app.core.permissions import (
    Permissions,
    require_any_permission,
    require_permission,
)
from app.modules.accounting import schemas
from app.modules.accounting.accounts import AccountService
from app.modules.accounting.bank import BankService
from app.modules.accounting.exports import build_pdf, build_xlsx, report_table
from app.modules.accounting.inventory import InventoryReconciliationService
from app.modules.accounting.periods import PeriodService
from app.modules.accounting.reports import GLReportService
from app.modules.accounting.service import AccountingService
from app.shared.exceptions import ValidationError

router = APIRouter(prefix="/accounting", tags=["accounting"])


def _service(db, tenant_id, user_id=None) -> AccountingService:
    return AccountingService(db, tenant_id, user_id)


def _account_service(db, tenant_id, user_id=None) -> AccountService:
    return AccountService(db, tenant_id, user_id)


def _gl_service(db, tenant_id) -> GLReportService:
    return GLReportService(db, tenant_id)


def _period_service(db, tenant_id, user_id=None) -> PeriodService:
    return PeriodService(db, tenant_id, user_id)


def _bank_service(db, tenant_id, user_id=None) -> BankService:
    return BankService(db, tenant_id, user_id)


def _inventory_service(db, tenant_id) -> InventoryReconciliationService:
    return InventoryReconciliationService(db, tenant_id)


class _Filters:
    def __init__(
        self,
        date_from: date | None = Query(default=None),
        date_to: date | None = Query(default=None),
        customer_id: UUID | None = Query(default=None),
        min_amount: Decimal | None = Query(default=None),
        max_amount: Decimal | None = Query(default=None),
    ) -> None:
        self.date_from = date_from
        self.date_to = date_to
        self.customer_id = customer_id
        self.min_amount = min_amount
        self.max_amount = max_amount


@router.get("/settings", response_model=schemas.AccountingSettingsRead)
async def get_settings(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _service(db, tenant_id).get_settings()


@router.put("/settings", response_model=schemas.AccountingSettingsRead)
async def update_settings(
    data: schemas.AccountingSettingsUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_any_permission(Permissions.MANAGE_ACCOUNTING, Permissions.MANAGE_SETTINGS)),
):
    return await _service(db, tenant_id, user_id).update_settings(data)


@router.get("/trial-balance", response_model=schemas.TrialBalanceResponse)
async def trial_balance(
    filters: _Filters = Depends(),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _service(db, tenant_id).trial_balance(
        date_from=filters.date_from,
        date_to=filters.date_to,
        customer_id=filters.customer_id,
        min_amount=filters.min_amount,
        max_amount=filters.max_amount,
    )


@router.get("/profit-loss", response_model=schemas.ProfitLossResponse)
async def profit_loss(
    filters: _Filters = Depends(),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _service(db, tenant_id).profit_and_loss(
        date_from=filters.date_from,
        date_to=filters.date_to,
        customer_id=filters.customer_id,
        min_amount=filters.min_amount,
        max_amount=filters.max_amount,
    )


@router.get("/balance-sheet", response_model=schemas.BalanceSheetResponse)
async def balance_sheet(
    as_of: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _service(db, tenant_id).balance_sheet(as_of=as_of)


@router.get("/cash-flow", response_model=schemas.CashFlowResponse)
async def cash_flow(
    filters: _Filters = Depends(),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _service(db, tenant_id).cash_flow(
        date_from=filters.date_from,
        date_to=filters.date_to,
        customer_id=filters.customer_id,
        min_amount=filters.min_amount,
        max_amount=filters.max_amount,
    )


@router.get("/accounts", response_model=list[schemas.AccountRead])
async def list_accounts(
    account_type: str | None = Query(default=None),
    is_group: bool | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _service(db, tenant_id).accounts(
        account_type=account_type, is_group=is_group, is_active=is_active
    )


@router.post(
    "/accounts",
    response_model=schemas.AccountRead,
    status_code=201,
)
async def create_account(
    data: schemas.AccountCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_ACCOUNTING)),
):
    return await _account_service(db, tenant_id, user_id).create_account(data)


@router.patch("/accounts/{account_id}", response_model=schemas.AccountRead)
async def update_account(
    account_id: UUID,
    data: schemas.AccountUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_ACCOUNTING)),
):
    return await _account_service(db, tenant_id, user_id).update_account(account_id, data)


@router.get("/journal-entries", response_model=list[schemas.JournalEntryRead])
async def list_journal_entries(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    voucher_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _service(db, tenant_id).journal_entries(
        limit=limit,
        offset=offset,
        voucher_type=voucher_type,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )


@router.post(
    "/journal-entries",
    response_model=schemas.JournalEntryRead,
    status_code=201,
)
async def create_journal_entry(
    data: schemas.JournalEntryCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_TRANSACTIONS)),
):
    return await _service(db, tenant_id, user_id).create_journal_entry(data)


@router.get("/journal-entries/{entry_id}", response_model=schemas.JournalEntryRead)
async def get_journal_entry(
    entry_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _service(db, tenant_id).journal_entry(entry_id)


@router.get("/reconciliation", response_model=schemas.ReconciliationResponse)
async def reconciliation(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _service(db, tenant_id).reconciliation(date_from=date_from, date_to=date_to)


# ---- GL reports -----------------------------------------------------------------


@router.get("/gl/trial-balance", response_model=schemas.GLTrialBalanceResponse)
async def gl_trial_balance(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _gl_service(db, tenant_id).trial_balance(date_from=date_from, date_to=date_to)


@router.get("/gl/profit-loss", response_model=schemas.GLProfitLossResponse)
async def gl_profit_loss(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _gl_service(db, tenant_id).profit_and_loss(date_from=date_from, date_to=date_to)


@router.get("/gl/balance-sheet", response_model=schemas.GLBalanceSheetResponse)
async def gl_balance_sheet(
    as_of: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _gl_service(db, tenant_id).balance_sheet(as_of=as_of)


@router.get("/gl/cash-flow", response_model=schemas.GLCashFlowResponse)
async def gl_cash_flow(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _gl_service(db, tenant_id).cash_flow(date_from=date_from, date_to=date_to)


@router.get("/gl/day-book", response_model=schemas.GLDayBookResponse)
async def gl_day_book(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _gl_service(db, tenant_id).day_book(
        date_from=date_from,
        date_to=date_to,
        voucher_type=voucher_type,
        limit=limit,
        offset=offset,
    )


@router.get("/gl/ledger/{account_id}", response_model=schemas.GLLedgerResponse)
async def gl_ledger(
    account_id: UUID,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _gl_service(db, tenant_id).ledger(account_id, date_from=date_from, date_to=date_to)


@router.get(
    "/gl/party-statement",
    response_model=schemas.GLPartyStatementResponse,
)
async def gl_party_statement(
    party_type: str = Query(default="customer"),
    party_id: UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _gl_service(db, tenant_id).party_statement(
        party_type=party_type,
        party_id=party_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/gl/aging", response_model=schemas.GLAgingResponse)
async def gl_aging(
    as_of: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _gl_service(db, tenant_id).aging(as_of=as_of)


@router.get("/gl/tax-summary", response_model=schemas.GLTaxSummaryResponse)
async def gl_tax_summary(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _gl_service(db, tenant_id).tax_summary(date_from=date_from, date_to=date_to)


@router.get("/gl/export")
async def gl_export(
    report: str = Query(...),
    format: Literal["xlsx", "pdf"] = Query(default="xlsx"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    as_of: date | None = Query(default=None),
    account_id: UUID | None = Query(default=None),
    party_type: str = Query(default="customer"),
    party_id: UUID | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = _gl_service(db, tenant_id)
    if report == "trial-balance":
        payload = await service.trial_balance(date_from=date_from, date_to=date_to)
    elif report == "profit-loss":
        payload = await service.profit_and_loss(date_from=date_from, date_to=date_to)
    elif report == "balance-sheet":
        payload = await service.balance_sheet(as_of=as_of)
    elif report == "cash-flow":
        payload = await service.cash_flow(date_from=date_from, date_to=date_to)
    elif report == "day-book":
        payload = await service.day_book(
            date_from=date_from,
            date_to=date_to,
            voucher_type=voucher_type,
            limit=1000,
        )
    elif report == "ledger":
        if account_id is None:
            raise ValidationError("account_id is required for the ledger export")
        payload = await service.ledger(account_id, date_from=date_from, date_to=date_to)
    elif report == "party-statement":
        payload = await service.party_statement(
            party_type=party_type,
            party_id=party_id,
            date_from=date_from,
            date_to=date_to,
        )
    elif report == "aging":
        payload = await service.aging(as_of=as_of)
    elif report == "tax-summary":
        payload = await service.tax_summary(date_from=date_from, date_to=date_to)
    else:
        raise ValidationError(f"Unknown report: {report}")

    title, headers, rows = report_table(report, payload)
    content = (
        build_xlsx(title, headers, rows) if format == "xlsx" else build_pdf(title, headers, rows)
    )
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if format == "xlsx"
        else "application/pdf"
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{report}.{format}"'},
    )


@router.get("/fiscal-years", response_model=list[schemas.FiscalYearRead])
async def list_fiscal_years(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _period_service(db, tenant_id).list_fiscal_years()


@router.post(
    "/fiscal-years",
    response_model=schemas.FiscalYearRead,
    status_code=201,
)
async def create_fiscal_year(
    data: schemas.FiscalYearCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_ACCOUNTING)),
):
    return await _period_service(db, tenant_id, user_id).create_fiscal_year(data)


@router.get("/periods", response_model=list[schemas.AccountingPeriodRead])
async def list_periods(
    fiscal_year_id: UUID | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _period_service(db, tenant_id).list_periods(fiscal_year_id=fiscal_year_id)


@router.post(
    "/periods/{period_id}/close",
    response_model=schemas.AccountingPeriodRead,
)
async def close_period(
    period_id: UUID,
    data: schemas.PeriodActionRequest | None = None,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.CLOSE_PERIOD)),
):
    return await _period_service(db, tenant_id, user_id).close_period(
        period_id, reason=data.reason if data else None
    )


@router.post(
    "/periods/{period_id}/reopen",
    response_model=schemas.AccountingPeriodRead,
)
async def reopen_period(
    period_id: UUID,
    data: schemas.PeriodActionRequest | None = None,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.CLOSE_PERIOD)),
):
    return await _period_service(db, tenant_id, user_id).reopen_period(
        period_id, reason=data.reason if data else None
    )


@router.get("/audit-log", response_model=list[schemas.AuditLogRead])
async def audit_log(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    entity_type: str | None = Query(default=None),
    entity_id: UUID | None = Query(default=None),
    action: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_AUDIT)),
):
    return await _period_service(db, tenant_id).audit_logs(
        limit=limit,
        offset=offset,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/bank-accounts", response_model=list[schemas.BankAccountRead])
async def list_bank_accounts(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _bank_service(db, tenant_id).list_accounts()


@router.post(
    "/bank-accounts",
    response_model=schemas.BankAccountRead,
    status_code=201,
)
async def create_bank_account(
    data: schemas.BankAccountCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_ACCOUNTING)),
):
    return await _bank_service(db, tenant_id, user_id).create_account(data)


@router.get(
    "/bank-accounts/{account_id}/statement-lines",
    response_model=list[schemas.BankStatementLineRead],
)
async def list_bank_statement_lines(
    account_id: UUID,
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _bank_service(db, tenant_id).list_lines(
        account_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/bank-accounts/{account_id}/statement-lines",
    response_model=list[schemas.BankStatementLineRead],
    status_code=201,
)
async def import_bank_statement_lines(
    account_id: UUID,
    data: schemas.BankStatementImport,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_ACCOUNTING)),
):
    return await _bank_service(db, tenant_id, user_id).import_lines(account_id, data)


@router.post(
    "/bank-accounts/{account_id}/auto-match",
    response_model=schemas.BankAutoMatchResponse,
)
async def auto_match_bank_account(
    account_id: UUID,
    data: schemas.BankAutoMatchRequest | None = None,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_ACCOUNTING)),
):
    return await _bank_service(db, tenant_id, user_id).auto_match(
        account_id, data or schemas.BankAutoMatchRequest()
    )


@router.get(
    "/bank-accounts/{account_id}/reconciliation",
    response_model=schemas.BankReconciliationResponse,
)
async def bank_reconciliation(
    account_id: UUID,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _bank_service(db, tenant_id).reconciliation(
        account_id, date_from=date_from, date_to=date_to
    )


@router.post(
    "/bank-statement-lines/{line_id}/match",
    response_model=schemas.BankStatementLineRead,
)
async def match_bank_statement_line(
    line_id: UUID,
    data: schemas.BankMatchRequest,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_ACCOUNTING)),
):
    return await _bank_service(db, tenant_id, user_id).match_line(line_id, data)


@router.post(
    "/bank-statement-lines/{line_id}/unmatch",
    response_model=schemas.BankStatementLineRead,
)
async def unmatch_bank_statement_line(
    line_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_ACCOUNTING)),
):
    return await _bank_service(db, tenant_id, user_id).unmatch_line(line_id)


@router.get(
    "/inventory/reconciliation",
    response_model=schemas.InventoryReconciliationResponse,
)
async def inventory_reconciliation(
    as_of: date | None = Query(default=None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    return await _inventory_service(db, tenant_id).reconciliation(as_of=as_of)
