from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.permissions import Permissions, require_permission
from app.modules.accounting import schemas
from app.modules.accounting.service import AccountingService

router = APIRouter(prefix="/accounting", tags=["accounting"])


def _service(db, tenant_id) -> AccountingService:
    return AccountingService(db, tenant_id)


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
    _=Depends(require_permission(Permissions.MANAGE_SETTINGS)),
):
    return await _service(db, tenant_id).update_settings(data)


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
