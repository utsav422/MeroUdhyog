from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.routes.schemas import RouteCreate, RouteRead, RouteUpdate
from app.modules.routes.service import RouteService

router = APIRouter(prefix="/routes", tags=["routes"])


async def _service(db, tenant_id) -> RouteService:
    return RouteService(db, tenant_id)


@router.get("", response_model=list[RouteRead])
async def list_routes(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list(limit, offset)


@router.post("", response_model=RouteRead, status_code=status.HTTP_201_CREATED)
async def create_route(
    data: RouteCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    return await service.create(data)


@router.get("/{route_id}", response_model=RouteRead)
async def get_route(
    route_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.get(route_id)


@router.patch("/{route_id}", response_model=RouteRead)
async def update_route(
    route_id: UUID,
    data: RouteUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    return await service.update(route_id, data)


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route(
    route_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    await service.delete(route_id)
