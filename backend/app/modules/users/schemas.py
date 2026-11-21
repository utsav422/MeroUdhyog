from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)
    role: str = Field(default="viewer", min_length=1, max_length=50)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    role: str | None = Field(default=None, min_length=1, max_length=50)
    is_active: bool | None = None


class EmailAvailabilityResponse(BaseModel):
    available: bool


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    is_superadmin: bool
    is_email_verified: bool
    created_at: datetime


class UserMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    email: EmailStr
    full_name: str
    role: str
    is_superadmin: bool


class UserProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def _require_location_pair(self) -> "UserProfileUpdate":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both latitude and longitude, or clear both")
        return self


class UserProfileRead(BaseModel):
    id: UUID
    tenant_id: UUID
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    is_superadmin: bool
    is_email_verified: bool
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    avatar_url: str | None = None
    created_at: datetime
