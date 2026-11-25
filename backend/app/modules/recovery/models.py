"""Records waiting in the Recovery (trash) page.

A delete always writes one root item plus an item for every dependent record
that must disappear with it (orders, delivered orders, khata rows, payments,
variants...). The ``depends_on`` graph drives both restore and permanent delete:
a dependent cannot be restored before its parent, and deleting a parent removes
its whole subtree.
"""

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RecoveryItem(Base):
    __tablename__ = "recovery_items"
    __table_args__ = (
        Index("ix_recovery_tenant_type_deleted", "tenant_id", "entity_type", "deleted_at"),
        Index("ix_recovery_batch", "tenant_id", "batch_id"),
        Index(
            "uq_recovery_active_item",
            "tenant_id",
            "entity_type",
            "entity_id",
            unique=True,
            postgresql_where=text("state = 'trashed'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    depends_on: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    batch_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    state: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="trashed", default="trashed"
    )
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    restored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    def __str__(self) -> str:
        return self.label
