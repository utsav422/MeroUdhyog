from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    contact_number: str | None = Field(default=None, max_length=50)
    tax_id: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=200)
    address: str | None = None
    city: str | None = Field(default=None, max_length=120)
    route_id: UUID | None = None
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    notes: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    contact_number: str | None = Field(default=None, max_length=50)
    tax_id: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=200)
    address: str | None = None
    city: str | None = Field(default=None, max_length=120)
    route_id: UUID | None = None
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    notes: str | None = None
    is_active: bool | None = None


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    email: str | None
    phone: str | None
    contact_number: str | None
    tax_id: str | None
    company: str | None
    address: str | None
    city: str | None
    route_id: UUID | None
    latitude: Decimal | None
    longitude: Decimal | None
    notes: str | None
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