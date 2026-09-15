from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Payment methods (extendable). Mirrors the enum on the model/service.
VALID_METHODS = {"cash", "bank_transfer", "esewa", "khalti", "other"}

VALID_METHOD_LABELS = {
    "cash": "Cash",
    "bank_transfer": "Bank transfer",
    "esewa": "eSewa",
    "khalti": "Khalti",
    "other": "Other",
}


class KhataOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_id: UUID
    order_ref: str
    created_at: datetime
    status: str
    total_amount: Decimal
    amount_paid: Decimal
    payment_status: str

    @property
    def balance(self) -> Decimal:
        return max(Decimal("0"), self.total_amount - self.amount_paid)


class KhataCustomerSummary(BaseModel):
    customer_id: UUID
    customer_name: str
    phone: str | None = None
    company: str | None = None
    city: str | None = None
    total_billed: Decimal = Decimal("0")
    total_paid: Decimal = Decimal("0")
    # outstanding = billed - paid (negative means the customer is in credit)
    outstanding: Decimal = Decimal("0")
    order_count: int = 0
    last_payment_date: datetime | None = None
    last_payment_amount: Decimal | None = None


class PaymentAllocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_id: UUID
    order_ref: str | None = None
    amount_applied: Decimal


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_id: UUID | None
    customer_name: str | None = None
    amount: Decimal
    method: str
    collected_by: UUID | None
    collector_name: str | None = None
    collected_at: datetime
    note: str | None = None
    receipt_number: str | None = None
    status: str
    voided_at: datetime | None = None
    void_reason: str | None = None
    allocations: list[PaymentAllocationRead] = Field(default_factory=list)


class CustomerKhataDetail(BaseModel):
    customer_id: UUID
    customer_name: str
    phone: str | None = None
    email: str | None = None
    company: str | None = None
    city: str | None = None
    address: str | None = None
    total_billed: Decimal
    total_paid: Decimal
    outstanding: Decimal
    orders: list[KhataOrderRead] = Field(default_factory=list)
    payments: list[PaymentRead] = Field(default_factory=list)


class ManualAllocation(BaseModel):
    order_id: UUID
    amount: Decimal = Field(gt=0, decimal_places=2)


class RecordPaymentInput(BaseModel):
    customer_id: UUID
    amount: Decimal = Field(gt=0, decimal_places=2)
    method: str = Field(min_length=1, max_length=20)
    collected_at: datetime | None = None
    note: str | None = Field(default=None, max_length=500)
    # Optional manual allocations. When omitted the payment is auto-applied to
    # the oldest outstanding orders first (FIFO).
    allocations: list[ManualAllocation] | None = None
    generate_receipt: bool = True

    def validate_method(self) -> None:
        if self.method not in VALID_METHODS:
            raise ValueError(f"method must be one of: {', '.join(sorted(VALID_METHODS))}")


class VoidPaymentInput(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ImageAsset(BaseModel):
    mime: str
    data_url: str


class BillTemplateRead(BaseModel):
    business_name: str
    tax_id: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    footer_note: str | None = None
    invoice_number_prefix: str
    receipt_number_prefix: str
    next_invoice_number: int
    next_receipt_number: int
    # Default VAT/tax rate (%) used when a new invoice is first created.
    invoice_tax_rate: Decimal = Decimal("0")
    logo: ImageAsset | None = None
    signature: ImageAsset | None = None
    # Normalized bill layout (blocks) — see app.modules.khata.layout.
    layout: dict

    def to_snapshot(self) -> dict:
        return {
            "business_name": self.business_name,
            "tax_id": self.tax_id,
            "address": self.address,
            "phone": self.phone,
            "email": self.email,
            "footer_note": self.footer_note,
            "invoice_number_prefix": self.invoice_number_prefix,
            "receipt_number_prefix": self.receipt_number_prefix,
            "next_invoice_number": self.next_invoice_number,
            "next_receipt_number": self.next_receipt_number,
            "invoice_tax_rate": self.invoice_tax_rate,
            "logo": self.logo,
            "signature": self.signature,
            "layout": self.layout,
        }


class BillTemplateUpdate(BaseModel):
    business_name: str | None = Field(default=None, max_length=200)
    tax_id: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    footer_note: str | None = Field(default=None, max_length=500)
    invoice_number_prefix: str | None = Field(default=None, max_length=12)
    receipt_number_prefix: str | None = Field(default=None, max_length=12)
    invoice_tax_rate: Decimal | None = Field(
        default=None, ge=0, le=100, decimal_places=2
    )
    # Raw bill layout (blocks) — normalized + validated by the service.
    layout: dict | None = None


class ReceiptRead(BaseModel):
    id: UUID
    receipt_number: str | None = None
    customer_id: UUID | None
    customer_name: str | None = None
    amount: Decimal
    method: str
    collected_at: datetime
    note: str | None = None
    collector_name: str | None = None
    status: str
    voided_at: datetime | None = None
    void_reason: str | None = None
    snapshot: dict | None = None
    allocations: list[PaymentAllocationRead] = Field(default_factory=list)


class InvoiceItemRead(BaseModel):
    product_name: str
    variant_name: str | None = None
    unit: str | None = None
    quantity: Decimal
    unit_price: Decimal
    amount: Decimal


class InvoiceItemInput(BaseModel):
    """Editable line item in an invoice's document content (not the order).

    ``amount`` is always recomputed server-side (quantity × unit_price).
    """

    product_name: str = Field(min_length=1, max_length=200)
    variant_name: str | None = Field(default=None, max_length=100)
    unit: str | None = Field(default=None, max_length=30)
    quantity: Decimal = Field(gt=0, decimal_places=4)
    unit_price: Decimal = Field(ge=0, decimal_places=2)


class InvoiceUpdate(BaseModel):
    """Admin edits for an invoice *document* — never touches the order/ledger."""

    items: list[InvoiceItemInput] = Field(default_factory=list)
    # VAT/tax rate (%) applied to the subtotal.
    tax_rate: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)


class InvoiceListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    invoice_number: str
    order_id: UUID
    order_ref: str
    created_at: datetime
    status: str
    payment_status: str
    total_amount: Decimal
    amount_paid: Decimal
    customer_id: UUID | None
    customer_name: str | None = None
    customer_phone: str | None = None


class InvoiceRead(BaseModel):
    invoice_number: str
    order_id: UUID
    order_ref: str
    created_at: datetime
    status: str
    payment_status: str
    # Document contents (line items + tax + note) — editable snapshot.
    subtotal: Decimal
    tax_rate: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    total_amount: Decimal  # subtotal + tax
    amount_paid: Decimal
    customer_id: UUID | None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    note: str | None = None
    items: list[InvoiceItemRead] = Field(default_factory=list)
    snapshot: dict | None = None