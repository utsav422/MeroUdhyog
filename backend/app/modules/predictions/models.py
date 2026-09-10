import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.modules.customers.models import Customer
from app.modules.products.models import Product, ProductVariant
from app.modules.tenants.models import Tenant


def _now() -> datetime:
    return datetime.now(UTC)


class OrderHistory(Base):
    """One row per historical order event used by the prediction engine.

    ``source`` distinguishes CSV-imported history from rows mirrored from the
    live ``orders``/``order_items`` tables so the analysis can be explained and
    (for CSV rows) individually managed. Order dates are kept timezone-aware
    for consistency with the rest of the schema.
    """

    __tablename__ = "order_history"
    __table_args__ = (
        Index("ix_order_history_tenant_id", "tenant_id"),
        Index("ix_order_history_tenant_customer", "tenant_id", "customer_id"),
        Index("ix_order_history_tenant_product", "tenant_id", "product_id"),
        Index("ix_order_history_tenant_date", "tenant_id", "order_date"),
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
    customer_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
    )
    customer: Mapped["Customer"] = relationship(
        foreign_keys=[customer_id], viewonly=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    product: Mapped["Product"] = relationship(foreign_keys=[product_id], viewonly=True)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="SET NULL"),
        nullable=True,
    )
    variant: Mapped["ProductVariant | None"] = relationship(
        foreign_keys=[variant_id], viewonly=True
    )
    order_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'csv'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __str__(self) -> str:
        return f"{self.customer_id} {self.product_id} @ {self.order_date:%Y-%m-%d}"