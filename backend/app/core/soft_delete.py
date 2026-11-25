"""Shared soft-delete plumbing.

Records that can end up in the Recovery page inherit :class:`SoftDeletable`.
Normal ORM selects automatically hide soft-deleted rows; recovery/admin code
opts back in with ``session.execution_options(include_deleted=True)`` or
``stmt.execution_options(include_deleted=True)``.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

USER_RECOVERY_DAYS = 2
ADMIN_RECOVERY_DAYS = 7


class SoftDeletable:
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    delete_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True, index=True
    )
