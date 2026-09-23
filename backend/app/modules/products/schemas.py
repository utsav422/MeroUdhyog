from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class VariantPriceCreate(BaseModel):
    price: Decimal = Field(ge=0, decimal_places=2)
    cost_price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    effective_from: datetime | None = None
    effective_to: datetime | None = None


class VariantPriceUpdate(BaseModel):
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    cost_price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    is_active: bool | None = None


class VariantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sku: str | None = Field(default=None, max_length=100)
    attributes: dict | None = None
    size: str | None = Field(default=None, max_length=50)
    size_type: str | None = Field(default=None, max_length=30)
    unit: str | None = Field(default=None, max_length=30)
    images: list[str] | None = None
    stock_quantity: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=5, ge=0)
    sort_order: int = 0
    prices: list[VariantPriceCreate] = Field(default_factory=list)


class VariantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    sku: str | None = Field(default=None, max_length=100)
    size: str | None = Field(default=None, max_length=50)
    size_type: str | None = Field(default=None, max_length=30)
    unit: str | None = Field(default=None, max_length=30)
    stock_quantity: int | None = Field(default=None, ge=0)
    low_stock_threshold: int | None = Field(default=None, ge=0)
    sort_order: int | None = None
    is_active: bool | None = None


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    sku: str | None = Field(default=None, max_length=100)
    category_id: UUID | None = None
    variants: list[VariantCreate] = Field(min_length=1)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    sku: str | None = Field(default=None, max_length=100)
    category_id: UUID | None = None
    is_active: bool | None = None


class VariantPriceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    variant_id: UUID
    price: Decimal
    cost_price: Decimal | None
    currency: str
    effective_from: datetime | None
    effective_to: datetime | None
    is_active: bool


class VariantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    name: str
    sku: str | None
    attributes: dict | None
    size: str | None
    size_type: str | None
    unit: str | None
    images: list[str] | None
    sort_order: int
    is_active: bool
    stock_quantity: int
    low_stock_threshold: int
    prices: list[VariantPriceRead] = Field(default_factory=list)


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    sku: str | None
    category_id: UUID | None
    slug: str | None
    is_active: bool
    created_at: datetime
    variants: list[VariantRead] = Field(default_factory=list)


class ProductImportRowError(BaseModel):
    row: int
    message: str


class ProductImportResult(BaseModel):
    created: int
    failed: int
    errors: list[ProductImportRowError] = Field(default_factory=list)


class StockMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    variant_id: UUID
    product_id: UUID
    product_name: str
    variant_name: str | None
    quantity: int
    reason: str
    order_id: UUID | None
    created_at: datetime


class LowStockItemRead(BaseModel):
    product_id: UUID
    product_name: str
    variant_id: UUID
    variant_name: str | None
    sku: str | None
    stock_quantity: int
    low_stock_threshold: int