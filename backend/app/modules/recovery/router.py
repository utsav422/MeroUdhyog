from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_tenant_id, get_current_user_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.recovery.schemas import RecoveryItemRead, RecoveryList
from app.modules.recovery.service import RecoveryService
from app.shared.exceptions import ForbiddenError

router = APIRouter(prefix="/recovery", tags=["recovery"])


async def _service(db, tenant_id, user_id) -> RecoveryService:
    return RecoveryService(db, tenant_id, user_id)


@router.get("", response_model=RecoveryList)
async def list_recovery_items(
    pagination: tuple[int, int] = Depends(pagination_params),
    entity_type: str | None = None,
    search: str | None = None,
    admin_scope: bool = False,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    service = await _service(db, tenant_id, user_id)
    if admin_scope and not await service.resolve_admin():
        raise ForbiddenError("The admin recovery view is available to superadmins only")
    limit, offset = pagination
    return await service.list_items(
        entity_type=entity_type,
        search=search,
        limit=limit,
        offset=offset,
        admin_scope=admin_scope,
    )


@router.post("/{item_id}/restore", response_model=RecoveryItemRead)
async def restore_recovery_item(
    item_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id, user_id)
    return await service.restore(item_id)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def permanently_delete_recovery_item(
    item_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id, user_id)
    await service.permanently_delete(item_id)


@router.post("/purge", status_code=status.HTTP_200_OK)
async def purge_expired_items(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    from app.modules.recovery.purge import purge_expired

    service = await _service(db, tenant_id, user_id)
    if not await service.resolve_admin():
        raise ForbiddenError("Only the backend admin can run a purge")
    purged = await purge_expired(db, tenant_id=tenant_id)
    return {"purged": purged}
