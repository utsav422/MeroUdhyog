from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class DeliveryAssign(BaseModel):
    delivery_agent_id: UUID


class DeliveryBulkAssign(BaseModel):
    delivery_ids: list[UUID] = Field(min_length=1, max_length=500)
    delivery_agent_id: UUID


class DeliveryBulkAssignSkip(BaseModel):
    delivery_id: UUID
    reason: str


class DeliveryBulkAssignResult(BaseModel):
    assigned: int
    skipped: list[DeliveryBulkAssignSkip] = Field(default_factory=list)


class LocationReport(BaseModel):
    latitude: Decimal = Field(ge=-90, le=90)
    longitude: Decimal = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)


class AgentLiveRead(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr
    agent_lat: Decimal | None = None
    agent_lng: Decimal | None = None
    agent_location_updated_at: datetime | None = None
    active_deliveries: int = 0


class DeliveryUpdate(BaseModel):
    status: str | None = None
    delivered_lat: Decimal | None = Field(default=None, ge=-90, le=90)
    delivered_lng: Decimal | None = Field(default=None, ge=-180, le=180)
    proof_notes: str | None = None


class DeliveryLocationCreate(BaseModel):
    lat: Decimal = Field(ge=-90, le=90)
    lng: Decimal = Field(ge=-180, le=180)


class DeliveryLocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    delivery_id: UUID
    lat: Decimal
    lng: Decimal
    recorded_at: datetime


class DeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    order_id: UUID
    route_id: UUID | None
    delivery_agent_id: UUID | None
    status: str
    assigned_at: datetime | None
    picked_up_at: datetime | None
    delivered_at: datetime | None
    delivered_lat: Decimal | None
    delivered_lng: Decimal | None
    proof_notes: str | None
    created_at: datetime
    order_ref: str | None = None
    customer_name: str | None = None
    delivery_address: str | None = None
    delivery_lat: Decimal | None = None
    delivery_lng: Decimal | None = None
