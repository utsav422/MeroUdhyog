from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_tenant_id, get_db
from app.modules.tenants.schemas import TenantRead
from app.modules.tenants.service import TenantService

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/me", response_model=TenantRead)
async def get_my_tenant(
    tenant_id=Depends(get_current_tenant_id),
    db=Depends(get_db),
):
    service = TenantService(db)
    return await service.get_current(tenant_id)
