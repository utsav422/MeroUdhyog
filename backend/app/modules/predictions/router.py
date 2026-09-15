from uuid import UUID

from fastapi import APIRouter, Depends, Form, UploadFile, status
from fastapi.responses import Response

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.predictions.schemas import (
    AnalysisRead,
    CustomerDetailRead,
    HistoryCreate,
    ImportResult,
    OrderHistoryRead,
    ProductDetailRead,
)
from app.modules.predictions.service import PredictionService

router = APIRouter(prefix="/predictions", tags=["predictions"])


async def _service(db, tenant_id) -> PredictionService:
    return PredictionService(db, tenant_id)


@router.get("/analysis", response_model=AnalysisRead)
async def get_analysis(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = await _service(db, tenant_id)
    return await service.analysis()


@router.get("/customers/{customer_id}", response_model=CustomerDetailRead)
async def get_customer_detail(
    customer_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = await _service(db, tenant_id)
    return await service.customer_detail(customer_id)


@router.get("/products/{product_id}", response_model=ProductDetailRead)
async def get_product_detail(
    product_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = await _service(db, tenant_id)
    return await service.product_detail(product_id)


@router.get("/history", response_model=list[OrderHistoryRead])
async def list_history(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list_history(limit, offset)


@router.delete(
    "/history",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def clear_history(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.IMPORT_DATA)),
):
    service = await _service(db, tenant_id)
    await service.clear_history()


@router.post(
    "/history",
    response_model=ImportResult,
    status_code=status.HTTP_201_CREATED,
)
async def add_history(
    create: HistoryCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.IMPORT_DATA)),
):
    service = await _service(db, tenant_id)
    return await service.add_history(create)


@router.delete(
    "/history/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_history_row(
    row_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.IMPORT_DATA)),
):
    service = await _service(db, tenant_id)
    await service.delete_history_row(row_id)


@router.get("/import/sample")
async def download_import_sample(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    content = service.sample_csv()
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="order-history-import-sample.csv"'
        },
    )


@router.post(
    "/import",
    response_model=ImportResult,
    status_code=status.HTTP_201_CREATED,
)
async def upload_history_import(
    file: UploadFile,
    customer_id: UUID = Form(...),
    product_id: UUID = Form(...),
    variant_id: UUID | None = Form(None),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.IMPORT_DATA)),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        from app.shared.exceptions import ValidationError

        raise ValidationError("Please upload a .csv file")
    service = await _service(db, tenant_id)
    return await service.import_history(
        await file.read(),
        customer_id=customer_id,
        product_id=product_id,
        variant_id=variant_id,
    )