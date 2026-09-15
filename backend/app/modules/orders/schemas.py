from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OrderItemCreate(BaseModel):
    product_id: UUID
    variant_id: UUID | None = None
    quantity: Decimal = Field(gt=0, decimal_places=4)
    unit_price: Decimal | None = Field(default=None, ge=0, decimal_places=2)


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID
    product_id: UUID | None
    variant_id: UUID | None
    product_name: str
    variant_name: str | None
    unit: str | None = None
    quantity: Decimal
    unit_price: Decimal
    amount: Decimal


class OrderCreate(BaseModel):
    customer_id: UUID | None = None
    delivery_address: str | None = None
    delivery_lat: Decimal | None = Field(default=None, ge=-90, le=90)
    delivery_lng: Decimal | None = Field(default=None, ge=-180, le=180)
    notes: str | None = None
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderUpdate(BaseModel):
    customer_id: UUID | None = None
    delivery_address: str | None = None
    delivery_lat: Decimal | None = Field(default=None, ge=-90, le=90)
    delivery_lng: Decimal | None = Field(default=None, ge=-180, le=180)
    notes: str | None = None
    status: str | None = None
    # When provided, replaces the order's existing line items.
    items: list[OrderItemCreate] | None = None


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    order_ref: str
    customer_id: UUID | None
    route_id: UUID | None
    route_name: str | None = None
    status: str
    payment_status: str
    total_amount: Decimal
    amount_paid: Decimal
    delivery_address: str | None
    delivery_lat: Decimal | None
    delivery_lng: Decimal | None
    notes: str | None
    created_by: UUID | None
    created_at: datetime
    # Reorder chain: this order is a re-order of `reorder_of_id` (attempt #).
    reorder_of_id: UUID | None = None
    reorder_of_ref: str | None = None
    reorder_attempt: int | None = None
    items: list[OrderItemRead] = []
    # Set only when an update transitioned the order to "ready": true if a
    # delivery was created for it, false if one already existed.
    delivery_created: bool | None = None


class OrderBulkStatus(BaseModel):
    order_ids: list[UUID] = Field(min_length=1, max_length=500)
    status: str


class OrderBulkStatusSkip(BaseModel):
    order_id: UUID
    reason: str


class OrderBulkStatusResult(BaseModel):
    updated: int
    skipped: list[OrderBulkStatusSkip] = Field(default_factory=list)
