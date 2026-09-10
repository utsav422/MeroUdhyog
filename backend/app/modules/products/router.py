from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, status
from fastapi.responses import Response

from app.core.dependencies import get_current_tenant_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.customer_prices.schemas import CustomerPriceWithCustomerRead
from app.modules.customer_prices.service import CustomerPriceService
from app.modules.products.csv_import import build_sample_csv
from app.modules.products.schemas import (
    LowStockItemRead,
    ProductCreate,
    ProductImportResult,
    ProductRead,
    ProductUpdate,
    StockMovementRead,
    VariantCreate,
    VariantPriceCreate,
    VariantPriceRead,
    VariantPriceUpdate,
    VariantRead,
    VariantUpdate,
)
from app.modules.products.service import ProductService

router = APIRouter(prefix="/products", tags=["products"])


async def _service(db, tenant_id) -> ProductService:
    return ProductService(db, tenant_id)


@router.get("", response_model=list[ProductRead])
async def list_products(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list(limit, offset)


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
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
        headers={"Content-Disposition": 'attachment; filename="product-import-sample.csv"'},
    )


@router.post(
    "/import",
    response_model=ProductImportResult,
    status_code=status.HTTP_201_CREATED,
)
async def upload_product_import(
    file: UploadFile,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    rows = await service.create_from_csv(await file.read())
    errors = [
        {"row": row.row_number, "message": row.error}
        for row in rows
        if row.error is not None
    ]
    return ProductImportResult(
        created=sum(1 for row in rows if row.error is None),
        failed=len(errors),
        errors=errors,
    )


@router.get("/inventory/low", response_model=list[LowStockItemRead])
async def list_low_stock(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, _offset = pagination
    service = await _service(db, tenant_id)
    return await service.low_stock(limit)


@router.get("/inventory/movements", response_model=list[StockMovementRead])
async def list_stock_movements(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    limit, _offset = pagination
    service = await _service(db, tenant_id)
    return await service.stock_movements(limit)


@router.get("/{product_id}", response_model=ProductRead)
async def get_product(
    product_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = await _service(db, tenant_id)
    return await service.get(product_id)


@router.patch("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: UUID,
    data: ProductUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    return await service.update(product_id, data)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    await service.delete(product_id)


@router.post(
    "/{product_id}/variants",
    response_model=VariantRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_variant(
    product_id: UUID,
    data: VariantCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    return await service.add_variant(product_id, data)


@router.patch(
    "/{product_id}/variants/{variant_id}",
    response_model=VariantRead,
)
async def update_variant(
    product_id: UUID,
    variant_id: UUID,
    data: VariantUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    return await service.update_variant(product_id, variant_id, data)


@router.patch(
    "/{product_id}/variants/{variant_id}/prices/{price_id}",
    response_model=VariantPriceRead,
)
async def update_variant_price(
    product_id: UUID,
    variant_id: UUID,
    price_id: UUID,
    data: VariantPriceUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    return await service.update_variant_price(product_id, variant_id, price_id, data)


@router.post(
    "/{product_id}/variants/{variant_id}/prices",
    response_model=VariantPriceRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_variant_price(
    product_id: UUID,
    variant_id: UUID,
    data: VariantPriceCreate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    return await service.add_variant_price(product_id, variant_id, data)


@router.delete(
    "/{product_id}/variants/{variant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_variant(
    product_id: UUID,
    variant_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_CATALOG)),
):
    service = await _service(db, tenant_id)
    await service.delete_variant(product_id, variant_id)


@router.get(
    "/{product_id}/variants/{variant_id}/customer-prices",
    response_model=list[CustomerPriceWithCustomerRead],
)
async def list_variant_customer_prices(
    product_id: UUID,
    variant_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    # product_id isn't used for filtering (variant_id is already unique and
    # tenant-scoped) but is kept in the path since the frontend always has
    # both in context on the product detail page, and it matches the shape
    # of the sibling /variants/{variant_id}/prices route above.
    service = CustomerPriceService(db, tenant_id)
    return await service.list_for_variant(variant_id)