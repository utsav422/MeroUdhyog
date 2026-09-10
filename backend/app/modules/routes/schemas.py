from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RouteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    cities: list[str] = []
    agent_ids: list[UUID] = []


class RouteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    is_active: bool | None = None
    cities: list[str] | None = None
    agent_ids: list[UUID] | None = None


class RouteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    is_active: bool
    cities: list[str] = []
    agent_ids: list[UUID] = []
    created_at: datetime
    updated_at: datetime


class RouteResolve(BaseModel):
    city: str | None = None
