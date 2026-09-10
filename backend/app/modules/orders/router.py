from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_tenant_id, get_current_user_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.orders.schemas import (
    OrderBulkStatus,
    OrderBulkStatusResult,
    OrderCreate,
    OrderRead,
    OrderUpdate,
)
from app.modules.orders.service import OrderService

router = APIRouter(prefix="/orders", tags=["orders"])


async def _service(db, tenant_id, user_id=None) -> OrderService:
    return OrderService(db, tenant_id, user_id)


@router.get("", response_model=list[OrderRead])
async def list_orders(
    pagination: tuple[int, int] = Depends(pagination_params),
    status_filter: str | None = None,
    status: str | None = None,
    customer_id: UUID | None = None,
    route_id: UUID | None = None,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list(limit, offset, status_filter or status, customer_id, route_id)


@router.post("/bulk-status", response_model=OrderBulkStatusResult)
async def bulk_update_order_status(
    data: OrderBulkStatus,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    """Change the status of many orders at once, respecting valid transitions."""
    service = await _service(db, tenant_id)
    return await service.bulk_update_status(data.order_ids, data.status)


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(
    data: OrderCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id, user_id)
    return await service.create(data)


@router.get("/{order_id}", response_model=OrderRead)
async def get_order(
    order_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.get(order_id)


@router.patch("/{order_id}", response_model=OrderRead)
async def update_order(
    order_id: UUID,
    data: OrderUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    return await service.update(order_id, data)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order(
    order_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    await service.delete(order_id)
