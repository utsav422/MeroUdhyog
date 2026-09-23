import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.modules.tenants.models import Tenant


def _now() -> datetime:
    return datetime.now(UTC)


class Notification(Base):
    """A single in-app notification for one tenant.

    Recipient rules:
      * ``recipient_user_id`` set       -> only that user sees it
      * ``recipient_roles`` set         -> every user holding one of those roles
      * both null                       -> every tenant user

    ``dedupe_key`` guards against creating the same alert twice while it is
    still unread (low-stock, prediction "call this customer" …). A partial
    unique index only applies while ``read_at IS NULL``, so once the user
    reads (or dismisses) it, the next identical event creates a fresh one.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_tenant_created", "tenant_id", "created_at"),
        Index("ix_notifications_recipient_user", "recipient_user_id"),
        Index("ix_notifications_recipient_roles", "recipient_roles"),
        UniqueConstraint("tenant_id", "dedupe_key", name="uq_notifications_tenant_dedupe"),
        Index(
            "uq_notifications_unread_dedupe",
            "dedupe_key",
            unique=True,
            postgresql_where=text("dedupe_key IS NOT NULL AND read_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    tenant: Mapped["Tenant"] = relationship(foreign_keys=[tenant_id], viewonly=True)
    recipient_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    recipient_roles: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Which part of the CRM this came from: stock | order | delivery | payment | prediction | system.
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # App route to navigate to when the notification is clicked.
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # Extra structured context for dedupe + richer rendering, e.g. ids/severity.
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    dedupe_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def __str__(self) -> str:
        return f"[{self.category}] {self.title}"


class PushSubscription(Base):
    """A browser's Web Push endpoint for one user (used for lockscreen alerts)."""

    __tablename__ = "push_subscriptions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "endpoint", name="uq_push_subscriptions_endpoint"),
        Index("ix_push_subscriptions_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(1024), nullable=False)
    auth: Mapped[str] = mapped_column(String(256), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    def __str__(self) -> str:
        return self.endpoint