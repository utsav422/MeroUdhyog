from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status

from app.core.dependencies import (
    get_current_tenant_id,
    get_current_user_id,
    get_db,
)
from app.core.permissions import Permissions, require_permission
from app.modules.users.schemas import (
    UserCreate,
    UserProfileRead,
    UserProfileUpdate,
    UserRead,
)
from app.modules.users.service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileRead)
async def get_my_profile(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    service = UserService(db)
    return await service.get_profile(user_id, tenant_id)


@router.patch("/me", response_model=UserProfileRead)
async def update_my_profile(
    data: UserProfileUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    service = UserService(db)
    return await service.update_profile(user_id, tenant_id, data)


@router.post("/me/avatar", response_model=UserProfileRead)
async def upload_my_avatar(
    file: UploadFile = File(...),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    content = await file.read()
    service = UserService(db)
    return await service.set_avatar(
        user_id, tenant_id, file.content_type or "application/octet-stream", content
    )


@router.get("/me/avatar")
async def get_my_avatar(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    service = UserService(db)
    mime, content = await service.get_avatar(user_id, tenant_id)
    return Response(
        content=content,
        media_type=mime,
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_avatar(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
):
    service = UserService(db)
    await service.delete_avatar(user_id, tenant_id)


@router.get(
    "",
    response_model=list[UserRead],
)
async def list_users(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = UserService(db)
    users = await service.list_users(tenant_id, limit, offset)
    return [UserRead.model_validate(u) for u in users]


@router.post(
    "",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    data: UserCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_USERS)),
):
    service = UserService(db)
    return await service.create_user(tenant_id, data)
