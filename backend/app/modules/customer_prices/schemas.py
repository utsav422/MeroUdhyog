from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CustomerPriceCreate(BaseModel):
    variant_id: UUID
    price: Decimal = Field(ge=0, decimal_places=2)
    currency: str = Field(default="USD", min_length=3, max_length=3)


class CustomerPriceUpdate(BaseModel):
    price: Decimal = Field(ge=0, decimal_places=2)
    currency: str = Field(default="USD", min_length=3, max_length=3)


class CustomerPriceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    customer_id: UUID
    variant_id: UUID
    price: Decimal
    currency: str
    created_at: datetime
    updated_at: datetime


class CustomerPriceWithCustomerRead(BaseModel):
    """Customer price including the linked customer name for display."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    customer_id: UUID
    variant_id: UUID
    price: Decimal
    currency: str
    customer_name: str | None = None
    created_at: datetime
    updated_at: datetime
