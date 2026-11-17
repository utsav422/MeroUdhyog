import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
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
        CheckConstraint(
            "report_engine IN ('legacy', 'gl')",
            name="ck_accounting_settings_report_engine",
        ),
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
    # Which report engine the UI should use. Both are always available; this
    # flag lets a tenant stay on the legacy derived statements until it has
    # reviewed the GL reconciliation.
    report_engine: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'legacy'")
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __str__(self) -> str:
        return f"AccountingSettings:{self.tenant_id}"


class Account(Base):
    """A node in the tenant's chart of accounts."""

    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_accounts_tenant_code"),
        Index("ix_accounts_tenant_type", "tenant_id", "account_type"),
        Index("ix_accounts_tenant_parent", "tenant_id", "parent_id"),
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
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False)
    normal_balance: Mapped[str] = mapped_column(String(6), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_group: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    is_system: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __str__(self) -> str:
        return f"{self.code} {self.name}"


class JournalEntry(Base):
    """Voucher header; its lines carry the balanced debit/credit postings."""

    __tablename__ = "journal_entries"
    __table_args__ = (
        UniqueConstraint("tenant_id", "entry_no", name="uq_journal_entries_tenant_no"),
        CheckConstraint(
            "status IN ('draft', 'posted', 'void')",
            name="ck_journal_entries_status",
        ),
        Index("ix_journal_entries_tenant_date", "tenant_id", "entry_date"),
        Index("ix_journal_entries_tenant_type", "tenant_id", "voucher_type"),
        Index("ix_journal_entries_tenant_status", "tenant_id", "status"),
        Index(
            "ix_journal_entries_tenant_source",
            "tenant_id",
            "source_type",
            "source_id",
        ),
        Index(
            "uq_journal_entries_active_source",
            "tenant_id",
            "source_type",
            "source_id",
            unique=True,
            postgresql_where=text("source_type IS NOT NULL AND status <> 'void'"),
        ),
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
    entry_no: Mapped[str] = mapped_column(String(40), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    voucher_type: Mapped[str] = mapped_column(String(20), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'draft'")
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'NPR'")
    )
    reversal_of_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    posted_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    posted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    lines: Mapped[list["JournalLine"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )

    def __str__(self) -> str:
        return f"{self.entry_no} ({self.voucher_type})"


class JournalLine(Base):
    """One debit or credit posting against an account."""

    __tablename__ = "journal_lines"
    __table_args__ = (
        CheckConstraint(
            "debit >= 0 AND credit >= 0",
            name="ck_journal_lines_non_negative",
        ),
        CheckConstraint(
            "(debit = 0) <> (credit = 0)",
            name="ck_journal_lines_one_side",
        ),
        Index("ix_journal_lines_tenant_entry", "tenant_id", "journal_entry_id"),
        Index("ix_journal_lines_tenant_account", "tenant_id", "account_id"),
        Index(
            "ix_journal_lines_tenant_party",
            "tenant_id",
            "party_type",
            "party_id",
        ),
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
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="CASCADE"),
        nullable=False,
    )
    entry: Mapped["JournalEntry"] = relationship(back_populates="lines")
    account_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    line_no: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    debit: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default=text("0")
    )
    credit: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default=text("0")
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    party_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    party_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )


class FiscalYear(Base):
    __tablename__ = "fiscal_years"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "start_date", name="uq_fiscal_years_tenant_start"
        ),
        Index("ix_fiscal_years_tenant_dates", "tenant_id", "start_date", "end_date"),
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
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_closed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    closed_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )


class AccountingPeriod(Base):
    __tablename__ = "accounting_periods"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "fiscal_year_id",
            "start_date",
            name="uq_accounting_periods_tenant_fy_start",
        ),
        Index(
            "ix_accounting_periods_tenant_dates",
            "tenant_id",
            "start_date",
            "end_date",
        ),
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
    fiscal_year_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("fiscal_years.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_closed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    closed_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )


class PostingRule(Base):
    __tablename__ = "posting_rules"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "event_type",
            "name",
            name="uq_posting_rules_tenant_event_name",
        ),
        Index("ix_posting_rules_tenant_event", "tenant_id", "event_type"),
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
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    conditions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    lines: Mapped[list["PostingRuleLine"]] = relationship(
        back_populates="rule", cascade="all, delete-orphan"
    )


class PostingRuleLine(Base):
    __tablename__ = "posting_rule_lines"
    __table_args__ = (
        CheckConstraint(
            "side IN ('debit', 'credit')",
            name="ck_posting_rule_lines_side",
        ),
        Index("ix_posting_rule_lines_rule", "posting_rule_id"),
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
    posting_rule_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("posting_rules.id", ondelete="CASCADE"),
        nullable=False,
    )
    rule: Mapped["PostingRule"] = relationship(back_populates="lines")
    side: Mapped[str] = mapped_column(String(6), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount_basis: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default=text("'total'")
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    line_no: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )


class AccountingAuditLog(Base):
    __tablename__ = "accounting_audit_log"
    __table_args__ = (
        Index(
            "ix_accounting_audit_tenant_entity",
            "tenant_id",
            "entity_type",
            "entity_id",
        ),
        Index(
            "ix_accounting_audit_tenant_created",
            "tenant_id",
            "created_at",
        ),
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
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )


class BankAccount(Base):
    """A bank account used for statement reconciliation.

    ``gl_account_id`` points at the ledger account that carries the account's
    balance (normally ``1020 Bank Accounts``). Several bank accounts may share
    the control account; reconciliation reports make that explicit.
    """

    __tablename__ = "bank_accounts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_bank_accounts_tenant_name"),
        Index("ix_bank_accounts_tenant_id", "tenant_id"),
        Index("ix_bank_accounts_tenant_gl", "tenant_id", "gl_account_id"),
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
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'NPR'")
    )
    gl_account_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    gl_account: Mapped["Account"] = relationship(
        foreign_keys=[gl_account_id], viewonly=True
    )
    opening_balance: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default=text("0")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    def __str__(self) -> str:
        return self.name


class BankStatementLine(Base):
    """A single line imported from a bank statement.

    Positive ``amount`` = deposit, negative = withdrawal. Matched lines retain
    the journal line/entry they reconciled against.
    """

    __tablename__ = "bank_statement_lines"
    __table_args__ = (
        CheckConstraint(
            "status IN ('unmatched', 'matched')",
            name="ck_bank_statement_lines_status",
        ),
        Index("ix_bank_statement_lines_tenant_id", "tenant_id"),
        Index(
            "ix_bank_statement_lines_account_date",
            "bank_account_id",
            "statement_date",
        ),
        Index("ix_bank_statement_lines_tenant_status", "tenant_id", "status"),
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
    bank_account_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("bank_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    statement_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'unmatched'")
    )
    matched_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="SET NULL"),
        nullable=True,
    )
    matched_line_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("journal_lines.id", ondelete="SET NULL"),
        nullable=True,
    )
    matched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    matched_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    def __str__(self) -> str:
        return f"{self.statement_date} {self.amount}"
