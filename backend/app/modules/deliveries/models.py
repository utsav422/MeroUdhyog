import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.modules.orders.models import Order
from app.modules.routes.models import Route  # noqa: F401
from app.modules.tenants.models import Tenant
from app.modules.users.models import User


def _now() -> datetime:
    return datetime.now(UTC)


class Delivery(Base):
    __tablename__ = "deliveries"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_deliveries_order"),
        Index("ix_deliveries_tenant_id", "tenant_id"),
        Index("ix_deliveries_agent", "delivery_agent_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant: Mapped["Tenant"] = relationship(foreign_keys=[tenant_id], viewonly=True)
    order_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    order: Mapped["Order"] = relationship(foreign_keys=[order_id], viewonly=True)
    route_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("routes.id", ondelete="SET NULL"), nullable=True
    )
    route: Mapped["Route"] = relationship(foreign_keys=[route_id], viewonly=True)
    delivery_agent_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    delivery_agent: Mapped["User | None"] = relationship(
        foreign_keys=[delivery_agent_id], viewonly=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="pending_assignment"
    )
    assigned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    picked_up_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    delivered_lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    delivered_lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    proof_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __str__(self) -> str:
        # Only read an already-loaded relationship to stay safe when the
        # instance is detached (e.g. FastAdmin serialization) and avoid a
        # lazy load against a closed session.
        order = self.__dict__.get("order")
        if order is not None and getattr(order, "order_ref", None):
            return f"Delivery for {order.order_ref}"
        return f"Delivery {self.id}"


class DeliveryLocation(Base):
    __tablename__ = "delivery_locations"
    __table_args__ = (
        Index("ix_delivery_locations_delivery", "delivery_id", "recorded_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    delivery_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("deliveries.id", ondelete="CASCADE"),
        nullable=False,
    )
    delivery: Mapped["Delivery"] = relationship(foreign_keys=[delivery_id], viewonly=True)
    lat: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
