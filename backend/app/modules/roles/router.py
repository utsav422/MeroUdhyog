from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.roles.schemas import RoleCreate, RoleRead, RoleUpdate
from app.modules.roles.service import RoleService

router = APIRouter(prefix="/roles", tags=["roles"])


async def _service(db, tenant_id) -> RoleService:
    return RoleService(db, tenant_id)


@router.get("", response_model=list[RoleRead])
async def list_roles(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list(limit, offset)


@router.post("", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(
    data: RoleCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_USERS)),
):
    service = await _service(db, tenant_id)
    return await service.create(data)


@router.get("/{role_id}", response_model=RoleRead)
async def get_role(
    role_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.get(role_id)


@router.patch("/{role_id}", response_model=RoleRead)
async def update_role(
    role_id: UUID,
    data: RoleUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_USERS)),
):
    service = await _service(db, tenant_id)
    return await service.update(role_id, data)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_USERS)),
):
    service = await _service(db, tenant_id)
    await service.delete(role_id)
