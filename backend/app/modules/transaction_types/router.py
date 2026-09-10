from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.transaction_types.schemas import (
    TransactionTypeCreate,
    TransactionTypeRead,
    TransactionTypeUpdate,
)
from app.modules.transaction_types.service import TransactionTypeService

router = APIRouter(prefix="/transaction-types", tags=["transaction-types"])


async def _service(db, tenant_id) -> TransactionTypeService:
    return TransactionTypeService(db, tenant_id)


@router.get("", response_model=list[TransactionTypeRead])
async def list_transaction_types(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list(limit, offset)


@router.post("", response_model=TransactionTypeRead, status_code=status.HTTP_201_CREATED)
async def create_transaction_type(
    data: TransactionTypeCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_TRANSACTIONS)),
):
    service = await _service(db, tenant_id)
    return await service.create(data)


@router.get("/{type_id}", response_model=TransactionTypeRead)
async def get_transaction_type(
    type_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.get(type_id)


@router.patch("/{type_id}", response_model=TransactionTypeRead)
async def update_transaction_type(
    type_id: UUID,
    data: TransactionTypeUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_TRANSACTIONS)),
):
    service = await _service(db, tenant_id)
    return await service.update(type_id, data)


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction_type(
    type_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_TRANSACTIONS)),
):
    service = await _service(db, tenant_id)
    await service.delete(type_id)