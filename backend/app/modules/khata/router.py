from uuid import UUID
from datetime import date

from fastapi import APIRouter, Depends, Response, UploadFile, status

from app.core.dependencies import get_current_tenant_id, get_current_user_id, get_db
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_any_permission, require_permission
from app.modules.khata.schemas import (
    BillTemplateRead,
    BillTemplateUpdate,
    CustomerKhataDetail,
    InvoiceRead,
    KhataCustomerSummary,
    PaymentListRead,
    PaymentRead,
    ReceiptRead,
    RecordPaymentInput,
    VoidPaymentInput,
)
from app.modules.khata.service import KhataService

router = APIRouter(prefix="/khata", tags=["khata"])


async def _service(db, tenant_id: UUID, user_id=None) -> KhataService:
    return KhataService(db, tenant_id, user_id)


@router.get("/customers", response_model=list[KhataCustomerSummary])
async def list_customers(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_any_permission(Permissions.VIEW_ALL, Permissions.MANAGE_KHATA)),
):
    service = await _service(db, tenant_id)
    return await service.list_customers()


@router.get("/customers/{customer_id}", response_model=CustomerKhataDetail)
async def customer_khata(
    customer_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_any_permission(Permissions.VIEW_ALL, Permissions.MANAGE_KHATA)),
):
    service = await _service(db, tenant_id)
    return await service.customer_detail(customer_id)


@router.get("/payments", response_model=PaymentListRead)
async def list_payments(
    pagination: tuple[int, int] = Depends(pagination_params),
    customer_id: UUID | None = None,
    route_id: UUID | None = None,
    method: str | None = None,
    status: str | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_any_permission(Permissions.VIEW_ALL, Permissions.MANAGE_KHATA)),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list_payments(
        limit,
        offset,
        customer_id=customer_id,
        route_id=route_id,
        method=method,
        status=status,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )


@router.post("/payments", response_model=PaymentRead, status_code=status.HTTP_201_CREATED)
async def record_payment(
    data: RecordPaymentInput,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_KHATA)),
):
    service = await _service(db, tenant_id, user_id)
    return await service.record_payment(data)


@router.post("/payments/{entry_id}/void", response_model=PaymentRead)
async def void_payment(
    entry_id: UUID,
    data: VoidPaymentInput,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_KHATA)),
):
    """Reverse a recorded payment. Owner only — enforced inside the service."""
    service = await _service(db, tenant_id, user_id)
    return await service.void_payment(entry_id, data.reason)


@router.get("/receipts/{entry_id}", response_model=ReceiptRead)
async def get_receipt(
    entry_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_KHATA)),
):
    service = await _service(db, tenant_id)
    return await service.get_receipt(entry_id)


@router.get("/receipts/{entry_id}/pdf")
async def get_receipt_pdf(
    entry_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_any_permission(Permissions.VIEW_ALL, Permissions.MANAGE_KHATA)),
):
    service = await _service(db, tenant_id)
    pdf_bytes = await service.receipt_pdf(entry_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="receipt.pdf"'},
    )


@router.get("/orders/{order_id}/invoice", response_model=InvoiceRead)
async def get_invoice(
    order_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_any_permission(Permissions.VIEW_ALL, Permissions.MANAGE_KHATA)),
):
    service = await _service(db, tenant_id, user_id)
    return await service.get_invoice(order_id, user_id)


@router.get("/orders/{order_id}/invoice/pdf")
async def get_invoice_pdf(
    order_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_any_permission(Permissions.VIEW_ALL, Permissions.MANAGE_KHATA)),
):
    service = await _service(db, tenant_id, user_id)
    invoice = await service.get_invoice(order_id, user_id)
    pdf_bytes = await service.invoice_pdf(order_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{invoice.invoice_number}.pdf"'
        },
    )


@router.get("/settings/bill-template", response_model=BillTemplateRead)
async def get_bill_template(
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_BILL_TEMPLATE)),
):
    service = await _service(db, tenant_id)
    return await service.get_template_read()


@router.put("/settings/bill-template", response_model=BillTemplateRead)
async def update_bill_template(
    data: BillTemplateUpdate,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_BILL_TEMPLATE)),
):
    service = await _service(db, tenant_id, user_id)
    return await service.update_template(data)


async def _upload_image(
    db,
    tenant_id: UUID,
    user_id,
    kind: str,
    file: UploadFile,
) -> BillTemplateRead:
    content = await file.read()
    if not content:
        from app.shared.exceptions import ValidationError

        raise ValidationError("Uploaded file is empty")
    service = await _service(db, tenant_id, user_id)
    return await service.upload_image(kind, file.content_type or "image/png", content)


@router.post("/settings/bill-template/logo", response_model=BillTemplateRead)
async def upload_logo(
    file: UploadFile,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_BILL_TEMPLATE)),
):
    return await _upload_image(db, tenant_id, user_id, "logo", file)


@router.post("/settings/bill-template/signature", response_model=BillTemplateRead)
async def upload_signature(
    file: UploadFile,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_BILL_TEMPLATE)),
):
    return await _upload_image(db, tenant_id, user_id, "signature", file)