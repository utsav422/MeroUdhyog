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
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.modules.customers.models import Customer, Route
from app.modules.products.models import Product, ProductVariant
from app.modules.tenants.models import Tenant


def _now() -> datetime:
    return datetime.now(UTC)


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "order_ref", name="uq_orders_tenant_ref"),
        Index("ix_orders_tenant_id", "tenant_id"),
        Index("ix_orders_tenant_status", "tenant_id", "status"),
        Index("ix_orders_tenant_customer", "tenant_id", "customer_id"),
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
    order_ref: Mapped[str] = mapped_column(String(30), nullable=False)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    customer: Mapped["Customer | None"] = relationship(
        foreign_keys=[customer_id], viewonly=True
    )
    route_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("routes.id", ondelete="SET NULL"), nullable=True
    )
    route: Mapped[Route | None] = relationship(
        foreign_keys=[route_id], viewonly=True
    )
    # Reorder chain: a reorder is a fresh order placed to replace a
    # failed/cancelled one. `reorder_of_id` points at the order it replaces and
    # `reorder_attempt` is how many times this same order has been re-ordered
    # (1 = first reorder, 2 = second, ...), so the cancellation history of each
    # order survives in its own record instead of being overwritten.
    reorder_of_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    reorder_of: Mapped["Order | None"] = relationship(
        foreign_keys=[reorder_of_id], remote_side="Order.id", viewonly=True
    )
    reorder_attempt: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="draft")
    payment_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="unpaid")
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default=text("0")
    )
    # Running total of ledger allocations settled against this order. Recomputed
    # transactionally whenever a payment is recorded or voided — never set by
    # hand (see the khata module). `payment_status` is derived from it.
    amount_paid: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default=text("0")
    )
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", viewonly=False
    )
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    delivery_lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    @property
    def route_name(self) -> str | None:
        # Read only an already-loaded relationship to avoid a lazy load against
        # a closed session (mirrors Delivery.__str__).
        route = self.__dict__.get("route")
        if route is not None:
            return getattr(route, "name", None)
        return None

    @property
    def reorder_of_ref(self) -> str | None:
        # Readable ref of the order this one re-places (no lazy load).
        source = self.__dict__.get("reorder_of")
        if source is not None:
            return getattr(source, "order_ref", None)
        return None

    def __str__(self) -> str:
        return self.order_ref


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        Index("ix_order_items_order_id", "order_id"),
        Index("ix_order_items_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    order: Mapped["Order"] = relationship(back_populates="items")
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    tenant: Mapped["Tenant"] = relationship(foreign_keys=[tenant_id], viewonly=True)
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    product: Mapped["Product | None"] = relationship(
        foreign_keys=[product_id], viewonly=True
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True
    )
    variant: Mapped["ProductVariant | None"] = relationship(
        foreign_keys=[variant_id], viewonly=True
    )
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    variant_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    def __str__(self) -> str:
        return f"{self.product_name} x{self.quantity}"
