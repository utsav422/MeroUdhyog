from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    contact_number: str | None = Field(default=None, max_length=50)
    pan_no: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=200)
    address: str | None = None
    city: str | None = Field(default=None, max_length=120)
    route_id: UUID | None = None
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    notes: str | None = None
    # Optional ceiling on what the customer may owe at once. `None` = no limit.
    credit_limit: Decimal | None = Field(default=None, ge=0, decimal_places=2)


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    contact_number: str | None = Field(default=None, max_length=50)
    pan_no: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=200)
    address: str | None = None
    city: str | None = Field(default=None, max_length=120)
    route_id: UUID | None = None
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    notes: str | None = None
    is_active: bool | None = None
    # Explicit `null` clears the limit and restores unlimited ordering.
    credit_limit: Decimal | None = Field(default=None, ge=0, decimal_places=2)


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    email: str | None
    phone: str | None
    contact_number: str | None
    pan_no: str | None
    company: str | None
    address: str | None
    city: str | None
    route_id: UUID | None
    latitude: Decimal | None
    longitude: Decimal | None
    notes: str | None
    # Optional credit ceiling. The three fields below are derived from the
    # customer's committed orders and active payments (see `credit.py`):
    # `credit_used` is what is already consumed, `credit_available` what is
    # left before the limit bites, and `credit_utilization` the percentage
    # used. `available`/`utilization` are `null` when no limit is set.
    credit_limit: Decimal | None
    credit_used: Decimal = Decimal("0.00")
    credit_available: Decimal | None = None
    credit_utilization: Decimal | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CustomerImportRowError(BaseModel):
    row: int
    message: str


class CustomerImportResult(BaseModel):
    created: int
    failed: int
    errors: list[CustomerImportRowError] = Field(default_factory=list)