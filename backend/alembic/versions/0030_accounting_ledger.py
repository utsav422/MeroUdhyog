"""General ledger: chart of accounts, journals, periods, posting rules, audit log

Additive migration. Creates the double-entry accounting schema alongside the
existing single-entry ledger and backfills a default chart of accounts for every
existing tenant. No existing table is altered or dropped.

Revision ID: 0030_accounting_ledger
Revises: 0029_accounting_settings
Create Date: 2026-11-08
"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op
from app.modules.accounting.coa import DEFAULT_ACCOUNTS

revision: str = "0030_accounting_ledger"
down_revision: str | None = "0029_accounting_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _accounts_table() -> sa.TableClause:
    return sa.table(
        "accounts",
        sa.column("id", sa.Uuid()),
        sa.column("tenant_id", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("account_type", sa.String()),
        sa.column("normal_balance", sa.String()),
        sa.column("parent_id", sa.Uuid()),
        sa.column("is_group", sa.Boolean()),
        sa.column("is_system", sa.Boolean()),
        sa.column("is_active", sa.Boolean()),
        sa.column("description", sa.Text()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )


def _backfill_default_accounts() -> None:
    bind = op.get_bind()
    tenant_ids = bind.execute(sa.text("SELECT id FROM tenants")).scalars().all()
    if not tenant_ids:
        return

    now = datetime.now(UTC)
    accounts = _accounts_table()

    for tenant_id in tenant_ids:
        existing = dict(
            bind.execute(
                sa.text("SELECT code, id FROM accounts WHERE tenant_id = :tenant_id"),
                {"tenant_id": tenant_id},
            ).all()
        )

        ids: dict[str, uuid.UUID] = dict(existing)
        for spec in DEFAULT_ACCOUNTS:
            ids.setdefault(spec.code, uuid.uuid4())

        rows = []
        for spec in DEFAULT_ACCOUNTS:
            if spec.code in existing:
                continue
            rows.append(
                {
                    "id": ids[spec.code],
                    "tenant_id": tenant_id,
                    "code": spec.code,
                    "name": spec.name,
                    "account_type": spec.account_type,
                    "normal_balance": spec.normal_balance,
                    "parent_id": ids.get(spec.parent_code) if spec.parent_code else None,
                    "is_group": spec.is_group,
                    "is_system": True,
                    "is_active": True,
                    "description": None,
                    "created_at": now,
                    "updated_at": now,
                }
            )

        if rows:
            op.bulk_insert(accounts, rows)


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("account_type", sa.String(length=20), nullable=False),
        sa.Column("normal_balance", sa.String(length=6), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column(
            "is_group", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column(
            "is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column(
            "is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_accounts_tenant_code"),
    )
    op.create_index("ix_accounts_tenant_id", "accounts", ["tenant_id"])
    op.create_index(
        "ix_accounts_tenant_type", "accounts", ["tenant_id", "account_type"]
    )
    op.create_index(
        "ix_accounts_tenant_parent", "accounts", ["tenant_id", "parent_id"]
    )

    op.create_table(
        "fiscal_years",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column(
            "is_closed", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["closed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id", "start_date", name="uq_fiscal_years_tenant_start"
        ),
    )
    op.create_index("ix_fiscal_years_tenant_id", "fiscal_years", ["tenant_id"])
    op.create_index(
        "ix_fiscal_years_tenant_dates",
        "fiscal_years",
        ["tenant_id", "start_date", "end_date"],
    )

    op.create_table(
        "accounting_periods",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("fiscal_year_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column(
            "is_closed", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["fiscal_year_id"], ["fiscal_years.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["closed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "fiscal_year_id",
            "start_date",
            name="uq_accounting_periods_tenant_fy_start",
        ),
    )
    op.create_index(
        "ix_accounting_periods_tenant_id", "accounting_periods", ["tenant_id"]
    )
    op.create_index(
        "ix_accounting_periods_tenant_dates",
        "accounting_periods",
        ["tenant_id", "start_date", "end_date"],
    )

    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("entry_no", sa.String(length=40), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("voucher_type", sa.String(length=20), nullable=False),
        sa.Column("reference", sa.String(length=100), nullable=True),
        sa.Column("narration", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=40), nullable=True),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'draft'"),
            nullable=False,
        ),
        sa.Column(
            "currency",
            sa.String(length=3),
            server_default=sa.text("'NPR'"),
            nullable=False,
        ),
        sa.Column("reversal_of_id", sa.Uuid(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("posted_by", sa.Uuid(), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["reversal_of_id"], ["journal_entries.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["posted_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id", "entry_no", name="uq_journal_entries_tenant_no"
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'posted', 'void')",
            name="ck_journal_entries_status",
        ),
    )
    op.create_index(
        "ix_journal_entries_tenant_id", "journal_entries", ["tenant_id"]
    )
    op.create_index(
        "ix_journal_entries_tenant_date",
        "journal_entries",
        ["tenant_id", "entry_date"],
    )
    op.create_index(
        "ix_journal_entries_tenant_type",
        "journal_entries",
        ["tenant_id", "voucher_type"],
    )
    op.create_index(
        "ix_journal_entries_tenant_status",
        "journal_entries",
        ["tenant_id", "status"],
    )
    op.create_index(
        "ix_journal_entries_tenant_source",
        "journal_entries",
        ["tenant_id", "source_type", "source_id"],
    )

    op.create_table(
        "journal_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column(
            "line_no", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
        sa.Column(
            "debit",
            sa.Numeric(precision=16, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "credit",
            sa.Numeric(precision=16, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("party_type", sa.String(length=20), nullable=True),
        sa.Column("party_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"], ["journal_entries.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["accounts.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "debit >= 0 AND credit >= 0", name="ck_journal_lines_non_negative"
        ),
        sa.CheckConstraint(
            "(debit = 0) <> (credit = 0)", name="ck_journal_lines_one_side"
        ),
    )
    op.create_index("ix_journal_lines_tenant_id", "journal_lines", ["tenant_id"])
    op.create_index(
        "ix_journal_lines_tenant_entry",
        "journal_lines",
        ["tenant_id", "journal_entry_id"],
    )
    op.create_index(
        "ix_journal_lines_tenant_account",
        "journal_lines",
        ["tenant_id", "account_id"],
    )
    op.create_index(
        "ix_journal_lines_tenant_party",
        "journal_lines",
        ["tenant_id", "party_type", "party_id"],
    )

    op.create_table(
        "posting_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "priority", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("conditions", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "event_type",
            "name",
            name="uq_posting_rules_tenant_event_name",
        ),
    )
    op.create_index("ix_posting_rules_tenant_id", "posting_rules", ["tenant_id"])
    op.create_index(
        "ix_posting_rules_tenant_event",
        "posting_rules",
        ["tenant_id", "event_type"],
    )

    op.create_table(
        "posting_rule_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("posting_rule_id", sa.Uuid(), nullable=False),
        sa.Column("side", sa.String(length=6), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column(
            "amount_basis",
            sa.String(length=30),
            server_default=sa.text("'total'"),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "line_no", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["posting_rule_id"], ["posting_rules.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["accounts.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "side IN ('debit', 'credit')", name="ck_posting_rule_lines_side"
        ),
    )
    op.create_index(
        "ix_posting_rule_lines_tenant_id", "posting_rule_lines", ["tenant_id"]
    )
    op.create_index(
        "ix_posting_rule_lines_rule", "posting_rule_lines", ["posting_rule_id"]
    )

    op.create_table(
        "accounting_audit_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("before", JSONB, nullable=True),
        sa.Column("after", JSONB, nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_accounting_audit_tenant_id", "accounting_audit_log", ["tenant_id"]
    )
    op.create_index(
        "ix_accounting_audit_tenant_entity",
        "accounting_audit_log",
        ["tenant_id", "entity_type", "entity_id"],
    )
    op.create_index(
        "ix_accounting_audit_tenant_created",
        "accounting_audit_log",
        ["tenant_id", "created_at"],
    )

    _backfill_default_accounts()


def downgrade() -> None:
    op.drop_table("accounting_audit_log")
    op.drop_table("posting_rule_lines")
    op.drop_table("posting_rules")
    op.drop_table("journal_lines")
    op.drop_table("journal_entries")
    op.drop_table("accounting_periods")
    op.drop_table("fiscal_years")
    op.drop_table("accounts")
