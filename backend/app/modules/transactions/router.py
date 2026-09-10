from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.transactions.schemas import TransactionCreate, TransactionRead, TransactionUpdate
from app.modules.transactions.service import TransactionService

router = APIRouter(prefix="/transactions", tags=["transactions"])


async def _service(db, tenant_id) -> TransactionService:
    return TransactionService(db, tenant_id)


@router.get("", response_model=list[TransactionRead])
async def list_transactions(
    pagination: tuple[int, int] = Depends(pagination_params),
    type_: str | None = None,
    customer_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list(
        limit, offset, type_=type_, customer_id=customer_id, date_from=date_from, date_to=date_to
    )


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    data: TransactionCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_TRANSACTIONS)),
):
    service = await _service(db, tenant_id)
    return await service.create(data)


@router.get("/{transaction_id}", response_model=TransactionRead)
async def get_transaction(
    transaction_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.get(transaction_id)


@router.patch("/{transaction_id}", response_model=TransactionRead)
async def update_transaction(
    transaction_id: UUID,
    data: TransactionUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_TRANSACTIONS)),
):
    service = await _service(db, tenant_id)
    return await service.update(transaction_id, data)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_TRANSACTIONS)),
):
    service = await _service(db, tenant_id)
    await service.delete(transaction_id)


@router.post("/{transaction_id}/reverse", response_model=TransactionRead)
async def reverse_transaction(
    transaction_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_TRANSACTIONS)),
):
    service = await _service(db, tenant_id)
    return await service.reverse(transaction_id)
