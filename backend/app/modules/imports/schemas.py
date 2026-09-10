from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ImportBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    status: str
    filename: str | None
    total_rows: int
    success_count: int
    error_count: int
    created_at: datetime
    updated_at: datetime


class ImportRowErrorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    batch_id: UUID
    row_number: int
    field: str | None
    message: str
    raw_data: dict | None
    created_at: datetime


class ImportRowInput(BaseModel):
    type: str = Field(min_length=1, max_length=20)
    transaction_date: datetime
    external_id: str | None = Field(default=None, max_length=100)
    amount: str = Field(min_length=1, max_length=30, description="Decimal string")
    customer_email: str | None = Field(default=None, max_length=255)
    product_sku: str | None = Field(default=None, max_length=100)
    quantity: str | None = None
    unit_price: str | None = None
    tax_amount: str | None = None
    discount_amount: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    description: str | None = None


class ImportRequest(BaseModel):
    rows: list[ImportRowInput] = Field(min_length=1, max_length=5000)
    filename: str | None = Field(default=None, max_length=255)
