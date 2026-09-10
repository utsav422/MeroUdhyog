from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, status
from fastapi.responses import Response

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.customers.csv_import import build_sample_csv
from app.modules.customers.schemas import (
    CustomerCreate,
    CustomerImportResult,
    CustomerRead,
    CustomerUpdate,
)
from app.modules.customers.service import CustomerService

router = APIRouter(prefix="/customers", tags=["customers"])


async def _service(db, tenant_id) -> CustomerService:
    return CustomerService(db, tenant_id)


@router.get("", response_model=list[CustomerRead])
async def list_customers(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list(limit, offset)


@router.post("", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
async def create_customer(
    data: CustomerCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CUSTOMERS)),
):
    service = await _service(db, tenant_id)
    return await service.create(data)


@router.get("/import/sample")
async def download_import_sample(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    content = build_sample_csv()
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="customer-import-sample.csv"'},
    )


@router.post(
    "/import",
    response_model=CustomerImportResult,
    status_code=status.HTTP_201_CREATED,
)
async def upload_customer_import(
    file: UploadFile,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CUSTOMERS)),
):
    service = await _service(db, tenant_id)
    rows = await service.create_from_csv(await file.read())
    errors = [
        {"row": row.row_number, "message": row.error}
        for row in rows
        if row.error is not None
    ]
    return CustomerImportResult(
        created=sum(1 for row in rows if row.error is None),
        failed=len(errors),
        errors=errors,
    )


@router.get("/{customer_id}", response_model=CustomerRead)
async def get_customer(
    customer_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.get(customer_id)


@router.patch("/{customer_id}", response_model=CustomerRead)
async def update_customer(
    customer_id: UUID,
    data: CustomerUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CUSTOMERS)),
):
    service = await _service(db, tenant_id)
    return await service.update(customer_id, data)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CUSTOMERS)),
):
    service = await _service(db, tenant_id)
    await service.delete(customer_id)
