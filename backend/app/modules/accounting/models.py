import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.modules.tenants.models import Tenant


def _now() -> datetime:
    return datetime.now(UTC)


class AccountingSettings(Base):
    """Per-tenant opening balances and accounting parameters.

    The ledger in this system is cash-basis and single-entry, so a balance
    sheet derived purely from it can drift from reality (there is no historical
    opening position, no payables, no bank accounts). This row lets an
    accountant state the opening position once — as of ``book_start_date`` — so
    every statement afterwards ties out to a known figure.

    Convention: opening balances are stated on the *normal balance side* of the
    account. Cash/stock/receivables are debit accounts (positive = asset);
    loans/capital are credit accounts (positive = liability/equity).
    """

    __tablename__ = "accounting_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_accounting_settings_tenant"),
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

    business_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    fiscal_year_start_month: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    # The date the books were opened. Transactions before this are ignored in
    # the derived statements unless explicitly requested.
    book_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Opening balances (normal-balance-side positive).
    opening_cash: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default=text("0")
    )
    opening_receivables: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default=text("0")
    )
    opening_inventory: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default=text("0")
    )
    opening_other_assets: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default=text("0")
    )
    opening_payables: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default=text("0")
    )
    opening_loans: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default=text("0")
    )
    opening_capital: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default=text("0")
    )

    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'NPR'")
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __str__(self) -> str:
        return f"AccountingSettings:{self.tenant_id}"
