from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.permissions import Permissions, require_permission
from app.modules.customer_prices.schemas import (
    CustomerPriceCreate,
    CustomerPriceRead,
    CustomerPriceUpdate,
)
from app.modules.customer_prices.service import CustomerPriceService

router = APIRouter(tags=["customer-prices"])


async def _service(db, tenant_id) -> CustomerPriceService:
    return CustomerPriceService(db, tenant_id)


@router.get(
    "/customers/{customer_id}/prices", response_model=list[CustomerPriceRead]
)
async def list_customer_prices(
    customer_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.list_for_customer(customer_id)


@router.post(
    "/customers/{customer_id}/prices",
    response_model=CustomerPriceRead,
    status_code=status.HTTP_201_CREATED,
)
async def upsert_customer_price(
    customer_id: UUID,
    data: CustomerPriceCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CUSTOMERS)),
):
    service = await _service(db, tenant_id)
    return await service.upsert(customer_id, data)


@router.patch(
    "/customers/{customer_id}/prices/{variant_id}",
    response_model=CustomerPriceRead,
)
async def update_customer_price(
    customer_id: UUID,
    variant_id: UUID,
    data: CustomerPriceUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CUSTOMERS)),
):
    service = await _service(db, tenant_id)
    return await service.update(customer_id, variant_id, data)


@router.delete(
    "/customers/{customer_id}/prices/{variant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_customer_price(
    customer_id: UUID,
    variant_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CUSTOMERS)),
):
    service = await _service(db, tenant_id)
    await service.delete(customer_id, variant_id)
