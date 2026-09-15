"""Khata (customer ledger): payments, allocations, receipts/invoices and the
Owner-configured billing template.

A payment is recorded against a customer's running credit balance and applied
to their oldest outstanding orders first (FIFO). Every write here is atomic
with the affected orders' `payment_status`/`amount_paid` update — see the
khata service docs for the invariant.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.modules.customers.models import Customer
from app.modules.khata.layout import normalize_layout
from app.modules.orders.models import Order
from app.modules.users.models import User


def _now() -> datetime:
    return datetime.now(UTC)


class LedgerEntry(Base):
    """A recorded payment (the "Khata" row). Never hard-deleted — voided."""

    __tablename__ = "ledger_entries"
    __table_args__ = (
        Index("ix_ledger_entries_tenant_customer", "tenant_id", "customer_id"),
        Index("ix_ledger_entries_tenant_collected", "tenant_id", "collected_at"),
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
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    customer: Mapped["Customer | None"] = relationship(
        foreign_keys=[customer_id], viewonly=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    collected_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    collector: Mapped["User | None"] = relationship(
        foreign_keys=[collected_by], viewonly=True
    )
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    receipt_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Snapshot of the BillTemplate at collection time, frozen so later template
    # changes never rewrite already-issued receipts.
    receipt_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active")
    voided_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    allocations: Mapped[list["LedgerAllocation"]] = relationship(
        back_populates="ledger_entry", cascade="all, delete-orphan"
    )

    @property
    def customer_name(self) -> str | None:
        cust = self.__dict__.get("customer")
        return getattr(cust, "name", None) if cust is not None else None

    @property
    def collector_name(self) -> str | None:
        collector = self.__dict__.get("collector")
        return getattr(collector, "full_name", None) if collector is not None else None


class LedgerAllocation(Base):
    """How much of a payment was applied to a specific order.

    An order can be covered by several payments and a payment can cover several
    orders (FIFO or a manual pick).
    """

    __tablename__ = "ledger_allocations"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "ledger_entry_id", "order_id", name="uq_allocations_entry_order"
        ),
        Index("ix_ledger_allocations_order_id", "order_id"),
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
    ledger_entry_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("ledger_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ledger_entry: Mapped["LedgerEntry"] = relationship(back_populates="allocations")
    order_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order: Mapped["Order"] = relationship(foreign_keys=[order_id], viewonly=True)
    amount_applied: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    @property
    def order_ref(self) -> str | None:
        order = self.__dict__.get("order")
        return getattr(order, "order_ref", None) if order is not None else None


class OrderInvoice(Base):
    """Numbered invoice document produced for an order (frozen snapshot).

    ``template_snapshot`` freezes the branding/layout used when the invoice was
    first issued. ``data`` is the editable *document* content (line items, tax
    rate, note) that the PDF renders from — an admin can redefine it without
    touching the order, its total or the khata ledger.
    """

    __tablename__ = "order_invoices"
    __table_args__ = (
        UniqueConstraint("tenant_id", "order_id", name="uq_order_invoices_order"),
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
    order_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order: Mapped["Order"] = relationship(foreign_keys=[order_id], viewonly=True)
    invoice_number: Mapped[str] = mapped_column(String(40), nullable=False)
    template_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Editable document content: {"items": [...], "tax_rate": str, "note": str|None}.
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )


class BillTemplate(Base):
    """Owner-configured branding for receipts and invoices (one per tenant)."""

    __tablename__ = "bill_templates"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_bill_templates_tenant"),
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
    business_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    tax_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    footer_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Bill layout: ordered, per-document-type blocks (see app.modules.khata.layout).
    layout: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    invoice_number_prefix: Mapped[str] = mapped_column(
        String(12), nullable=False, server_default="INV-"
    )
    receipt_number_prefix: Mapped[str] = mapped_column(
        String(12), nullable=False, server_default="RCT-"
    )
    next_invoice_number: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    next_receipt_number: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    # Default VAT/GST rate (%) applied when a new invoice is first created.
    invoice_tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), nullable=False, server_default=text("0")
    )
    logo_mime: Mapped[str | None] = mapped_column(String(50), nullable=True)
    logo_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    signature_mime: Mapped[str | None] = mapped_column(String(50), nullable=True)
    signature_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def snapshot(self, extra: dict | None = None) -> dict:
        """Freeze the branding + numbering into a JSON snapshot for a document."""
        import base64

        def _img(mime: str | None, data: bytes | None) -> dict | None:
            if not mime or not data:
                return None
            return {"mime": mime, "data_b64": base64.b64encode(data).decode("ascii")}

        snap: dict = {
            "business_name": self.business_name,
            "tax_id": self.tax_id,
            "address": self.address,
            "phone": self.phone,
            "email": self.email,
            "footer_note": self.footer_note,
            "invoice_number_prefix": self.invoice_number_prefix,
            "receipt_number_prefix": self.receipt_number_prefix,
            "invoice_tax_rate": str(self.invoice_tax_rate or 0),
            "logo": _img(self.logo_mime, self.logo_data),
            "signature": _img(self.signature_mime, self.signature_data),
            "layout": normalize_layout(self.layout),
        }
        if extra:
            snap.update(extra)
        return snap