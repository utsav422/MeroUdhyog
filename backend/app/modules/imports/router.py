from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.imports.schemas import ImportBatchRead, ImportRequest, ImportRowErrorRead
from app.modules.imports.service import ImportService

router = APIRouter(prefix="/imports", tags=["imports"])


async def _service(db, tenant_id) -> ImportService:
    return ImportService(db, tenant_id)


@router.post("", response_model=ImportBatchRead, status_code=status.HTTP_201_CREATED)
async def submit_import(
    data: ImportRequest,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.IMPORT_DATA)),
):
    service = await _service(db, tenant_id)
    batch = await service.submit(data)
    return ImportBatchRead.model_validate(batch)


@router.post("/upload", response_model=ImportBatchRead, status_code=status.HTTP_201_CREATED)
async def upload_import_file(
    file: UploadFile,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.IMPORT_DATA)),
):
    service = await _service(db, tenant_id)
    try:
        batch = await service.upload(file.filename or "upload.csv", await file.read())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return ImportBatchRead.model_validate(batch)


@router.get("", response_model=list[ImportBatchRead])
async def list_imports(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list_batches(limit, offset)


@router.get("/{batch_id}", response_model=ImportBatchRead)
async def import_status(
    batch_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    batch = await service.get_batch(batch_id)
    return ImportBatchRead.model_validate(batch)


@router.get("/{batch_id}/errors", response_model=list[ImportRowErrorRead])
async def import_row_errors(
    batch_id: UUID,
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list_row_errors(batch_id, limit, offset)
