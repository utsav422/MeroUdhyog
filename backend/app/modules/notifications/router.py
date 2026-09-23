from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status

from app.core.dependencies import (
    get_current_tenant_id,
    get_current_user_id,
    get_db,
)
from app.core.paginator import pagination_params
from app.modules.notifications import push
from app.modules.notifications.schemas import (
    NotificationRead,
    PushPublicKeyRead,
    PushSubscribeInput,
    PushUnsubscribeInput,
    ReadAllResult,
    UnreadCountRead,
)
from app.modules.notifications.service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


async def _service(db, tenant_id) -> NotificationService:
    return NotificationService(db, tenant_id)


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list_for_user(user_id, limit, offset)


@router.get("/unread-count", response_model=UnreadCountRead)
async def get_unread_count(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    service = await _service(db, tenant_id)
    return await service.unread_count(user_id)


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    service = await _service(db, tenant_id)
    return await service.mark_read(notification_id, user_id)


@router.post("/read-all", response_model=ReadAllResult)
async def mark_all_notifications_read(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    service = await _service(db, tenant_id)
    return await service.mark_all_read(user_id)


@router.get("/push/public-key", response_model=PushPublicKeyRead)
async def get_push_public_key():
    key = push.public_key()
    return PushPublicKeyRead(public_key=key, enabled=key is not None)


@router.post("/push/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe_to_push(
    data: PushSubscribeInput,
    request: Request,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    service = await _service(db, tenant_id)
    ua: Any = request.headers.get("user-agent")
    await service.save_subscription(user_id, data.endpoint, data.p256dh, data.auth, ua)
    return {"ok": True}


@router.post("/push/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_from_push(
    data: PushUnsubscribeInput,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),  # noqa: ARG001 - auth boundary
):
    service = await _service(db, tenant_id)
    await service.remove_subscription(data.endpoint)
    return None