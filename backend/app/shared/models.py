import uuid
from datetime import datetime
from typing import Annotated

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.core.database import Base

uuid_pk = Annotated[
    uuid.UUID,
    mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    ),
]

tenant_id_fk = Annotated[
    uuid.UUID,
    mapped_column(
        PGUUID(as_uuid=True),
        nullable=False,
        index=True,
    ),
]


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class TenantOwnedBase(Base):
    __abstract__ = True

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )

    @declared_attr
    def __table_args__(cls):
        return ()
