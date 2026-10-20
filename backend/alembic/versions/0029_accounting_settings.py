"""Accounting settings table (opening balances)

Adds ``accounting_settings``: one row per tenant holding opening balances and
accounting parameters so the derived balance sheet opens from a known position
and balances.

Revision ID: 0029_accounting_settings
Revises: 0028_khata_receipts_in_ledger
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0029_accounting_settings"
down_revision: str | None = "0028_khata_receipts_in_ledger"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "accounting_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("business_name", sa.String(length=200), nullable=True),
        sa.Column(
            "fiscal_year_start_month",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column("book_start_date", sa.Date(), nullable=True),
        sa.Column(
            "opening_cash",
            sa.Numeric(precision=16, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "opening_receivables",
            sa.Numeric(precision=16, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "opening_inventory",
            sa.Numeric(precision=16, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "opening_other_assets",
            sa.Numeric(precision=16, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "opening_payables",
            sa.Numeric(precision=16, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "opening_loans",
            sa.Numeric(precision=16, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "opening_capital",
            sa.Numeric(precision=16, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "currency",
            sa.String(length=3),
            server_default=sa.text("'NPR'"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_accounting_settings_tenant"),
    )
    op.create_index(
        "ix_accounting_settings_tenant_id",
        "accounting_settings",
        ["tenant_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_accounting_settings_tenant_id", table_name="accounting_settings")
    op.drop_table("accounting_settings")
