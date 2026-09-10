from datetime import date

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.permissions import Permissions, require_permission
from app.modules.finance.schemas import MonthlySummaryRead
from app.modules.finance.service import FinanceService

router = APIRouter(prefix="/finance", tags=["finance"])


async def _service(db, tenant_id) -> FinanceService:
    return FinanceService(db, tenant_id)


@router.get("/summary", response_model=MonthlySummaryRead)
async def finance_summary(
    month: date | None = None,
    currency: str = "USD",
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = await _service(db, tenant_id)
    target = month or date.today().replace(day=1)
    return await service.get_summary(target, currency.upper())


@router.get("/trends", response_model=list[MonthlySummaryRead])
async def finance_trends(
    months: int = 6,
    end_month: date | None = None,
    currency: str = "USD",
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = await _service(db, tenant_id)
    return await service.trends(months, end_month, currency.upper())


@router.get("/profitability", response_model=list[MonthlySummaryRead])
async def finance_profitability(
    year: int | None = None,
    currency: str = "USD",
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = await _service(db, tenant_id)
    target_year = year or date.today().year
    return await service.year_summary(target_year, currency.upper())