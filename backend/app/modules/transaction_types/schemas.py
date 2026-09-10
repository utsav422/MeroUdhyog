from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# A code is what Transaction.type stores, so it must fit the 20-char column.
CODE_PATTERN = r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$"


class TransactionTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=20, pattern=CODE_PATTERN)


class TransactionTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    code: str | None = Field(default=None, min_length=1, max_length=20, pattern=CODE_PATTERN)
    is_active: bool | None = None


class TransactionTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    code: str
    is_active: bool
    created_at: datetime