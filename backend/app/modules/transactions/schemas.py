from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# The type is validated against the tenant's `transaction_types` in the service
# layer, so it is a free string here (matches the 20-char DB column).
TYPE_PATTERN = r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$"


class TransactionCreate(BaseModel):
    type: str = Field(min_length=1, max_length=20, pattern=TYPE_PATTERN)
    transaction_date: datetime
    external_id: str | None = Field(default=None, max_length=100)
    quantity: Decimal | None = Field(default=None, ge=0)
    unit_price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    amount: Decimal = Field(ge=0, decimal_places=2)
    tax_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    discount_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    description: str | None = None
    customer_id: UUID | None = None
    product_id: UUID | None = None
    metadata_: dict | None = Field(default=None, alias="metadata")


class TransactionUpdate(BaseModel):
    type: str | None = Field(default=None, min_length=1, max_length=20, pattern=TYPE_PATTERN)
    transaction_date: datetime | None = None
    quantity: Decimal | None = Field(default=None, ge=0)
    unit_price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    tax_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    discount_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    description: str | None = None
    is_active: bool | None = None


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    tenant_id: UUID
    type: str
    transaction_date: datetime
    external_id: str | None
    quantity: Decimal | None
    unit_price: Decimal | None
    amount: Decimal
    tax_amount: Decimal | None
    discount_amount: Decimal | None
    currency: str
    description: str | None
    customer_id: UUID | None
    product_id: UUID | None
    reverses_id: UUID | None
    metadata_: dict | None = Field(
        validation_alias="metadata_", serialization_alias="metadata"
    )
    is_active: bool
    created_at: datetime
