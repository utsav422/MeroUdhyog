from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import (
    get_current_tenant_id,
    get_current_user_id,
    get_db,
)
from app.core.paginator import pagination_params
from app.core.permissions import (
    Permissions,
    has_permission,
    require_any_permission,
    require_permission,
)
from app.modules.deliveries.schemas import (
    AgentLiveRead,
    DeliveryAssign,
    DeliveryBulkAssign,
    DeliveryBulkAssignResult,
    DeliveryLocationCreate,
    DeliveryLocationRead,
    DeliveryRead,
    DeliveryUpdate,
    LocationReport,
)
from app.modules.deliveries.service import DeliveryService

router = APIRouter(prefix="/deliveries", tags=["deliveries"])


async def _service(db, tenant_id, user_id=None, is_agent=False) -> DeliveryService:
    return DeliveryService(db, tenant_id, user_id, is_agent)


@router.get("", response_model=list[DeliveryRead])
async def list_deliveries(
    pagination: tuple[int, int] = Depends(pagination_params),
    status_filter: str | None = None,
    status: str | None = None,
    agent_id: UUID | None = None,
    route_id: UUID | None = None,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list(limit, offset, status_filter or status, agent_id, route_id)


@router.get(
    "/me",
    response_model=list[DeliveryRead],
    dependencies=[
        Depends(
            require_any_permission(
                Permissions.VIEW_ASSIGNED_DELIVERIES, Permissions.MANAGE_CATALOG
            )
        )
    ],
)
async def list_my_deliveries(
    pagination: tuple[int, int] = Depends(pagination_params),
    status_filter: str | None = None,
    status: str | None = None,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    # Delivery agents only see deliveries assigned to them; catalog managers
    # (owner/admin/manager) see all deliveries across the team.
    is_agent = not await has_permission(db, user_id, Permissions.MANAGE_CATALOG)
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list(
        limit, offset, status_filter or status, agent_id=user_id if is_agent else None
    )


@router.post(
    "/me/location",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def report_my_location(
    data: LocationReport,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    """Report the caller's current GPS position (live delivery tracking)."""
    service = await _service(db, tenant_id)
    await service.report_location(user_id, data)


@router.get(
    "/agents",
    response_model=list[AgentLiveRead],
    dependencies=[
        Depends(
            require_any_permission(
                Permissions.VIEW_ASSIGNED_DELIVERIES, Permissions.MANAGE_CATALOG
            )
        )
    ],
)
async def list_agents_live(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    """List delivery staff with their last known live GPS position."""
    service = await _service(db, tenant_id)
    return await service.list_agents()


@router.get("/{delivery_id}", response_model=DeliveryRead)
async def get_delivery(
    delivery_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.get(delivery_id)


@router.post(
    "/bulk-assign", response_model=DeliveryBulkAssignResult
)
async def bulk_assign_deliveries(
    data: DeliveryBulkAssign,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    """Assign one delivery agent to many deliveries (e.g. a whole route)."""
    service = await _service(db, tenant_id)
    return await service.bulk_assign(data.delivery_ids, data.delivery_agent_id)


@router.post(
    "/from-order/{order_id}",
    response_model=DeliveryRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_delivery_for_order(
    order_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    return await service.create_for_order(order_id)


@router.patch("/{delivery_id}/assign", response_model=DeliveryRead)
async def assign_delivery(
    delivery_id: UUID,
    data: DeliveryAssign,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    return await service.assign(delivery_id, data)


@router.patch("/{delivery_id}", response_model=DeliveryRead)
async def update_delivery(
    delivery_id: UUID,
    data: DeliveryUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(
        require_any_permission(
            Permissions.MANAGE_CATALOG, Permissions.UPDATE_DELIVERY_STATUS
        )
    ),
):
    # Managers/admins may update any delivery; a delivery agent may only update
    # the status of deliveries assigned to them (enforced in the service).
    is_agent = not await has_permission(db, user_id, Permissions.MANAGE_CATALOG)
    service = await _service(db, tenant_id, user_id, is_agent=is_agent)
    return await service.update_status(delivery_id, data)


@router.post(
    "/{delivery_id}/locations",
    response_model=DeliveryLocationRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_delivery_location(
    delivery_id: UUID,
    data: DeliveryLocationCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.add_location(delivery_id, data)


@router.get(
    "/{delivery_id}/locations", response_model=list[DeliveryLocationRead]
)
async def list_delivery_locations(
    delivery_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.list_locations(delivery_id)
