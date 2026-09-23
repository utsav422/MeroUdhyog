from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    recipient_user_id: UUID | None = None
    recipient_roles: list[str] | None = None
    category: str
    title: str
    message: str | None = None
    link: str | None = None
    data: dict[str, Any] | None = None
    is_read: bool
    created_at: datetime
    updated_at: datetime


class UnreadCountRead(BaseModel):
    count: int


class ReadAllResult(BaseModel):
    updated: int


class PushSubscribeInput(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2000)
    p256dh: str = Field(min_length=1, max_length=1024)
    auth: str = Field(min_length=1, max_length=256)


class PushUnsubscribeInput(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2000)


class PushPublicKeyRead(BaseModel):
    public_key: str | None
    enabled: bool


# Categories used across the CRM; the frontend renders these as the
# notification card header ("which part of the CRM this came from").
NOTIFICATION_CATEGORIES = ("stock", "order", "delivery", "payment", "prediction", "system")

# Roles every "back-office" alert is broadcast to by default.
BACKOFFICE_ROLES = ["owner", "admin", "manager"]