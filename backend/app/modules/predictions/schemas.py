from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OrderHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    customer_id: UUID
    customer_name: str | None = None
    customer_email: str | None = None
    product_id: UUID
    product_name: str
    sku: str | None = None
    variant_id: UUID | None = None
    variant_name: str | None = None
    order_date: datetime
    quantity: Decimal
    source: str
    created_at: datetime


class HistoryRowInput(BaseModel):
    order_date: date
    quantity: Decimal = Field(gt=0)


class HistoryCreate(BaseModel):
    customer_id: UUID
    product_id: UUID
    variant_id: UUID | None = None
    rows: list[HistoryRowInput] = Field(min_length=1)


class ProductAggregateRead(BaseModel):
    product_id: UUID
    product_name: str
    sku: str | None
    variant_id: UUID | None
    variant_name: str | None
    customer_count: int
    order_count: int
    last_order_date: date | None
    next_order_date: date | None
    days_until_next: int | None
    avg_quantity: float
    interest_score: int
    stock_status: str
    recommendation: str
    overdue_count: int
    due_soon_count: int
    on_track_count: int
    insufficient_count: int


class ImportRowResult(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    created: int
    failed: int
    errors: list[ImportRowResult] = Field(default_factory=list)


class PredictionProductRead(BaseModel):
    product_id: UUID
    product_name: str
    sku: str | None
    variant_id: UUID | None
    variant_name: str | None
    order_count: int
    last_order_date: date | None
    avg_gap_days: float | None
    median_gap_days: float | None
    next_order_date: date | None
    days_until_next: int | None
    interest_score: int
    avg_quantity: float
    quantity_trend: str | None = None
    stock_status: str
    days_of_stock: float | None
    confidence: str
    recommendation: str


class CustomerPredictionRead(BaseModel):
    customer_id: UUID
    customer_name: str
    customer_email: str | None
    customer_phone: str | None
    order_count: int
    product_count: int
    last_order_date: date | None
    next_order_date: date | None
    days_until_next: int | None
    interest_score: int
    stock_status: str
    recommendation: str
    products: list[PredictionProductRead] = Field(default_factory=list)


class AnalysisSummary(BaseModel):
    customer_count: int
    product_pairs: int
    overdue_count: int
    due_soon_count: int
    on_track_count: int
    insufficient_data_count: int
    avg_interest: int
    next_7_days: int
    next_30_days: int


class AnalysisRead(BaseModel):
    generated_at: datetime
    tenant_avg_gap_days: float | None
    summary: AnalysisSummary
    customers: list[CustomerPredictionRead]
    products: list[ProductAggregateRead] = Field(default_factory=list)


class CustomerDetailRead(BaseModel):
    generated_at: datetime
    customer_id: UUID
    customer_name: str
    customer_email: str | None
    customer_phone: str | None
    order_count: int
    product_count: int
    last_order_date: date | None
    next_order_date: date | None
    days_until_next: int | None
    interest_score: int
    stock_status: str
    recommendation: str
    products: list[PredictionProductRead]