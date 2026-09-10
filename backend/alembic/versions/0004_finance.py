"""add monthly_financial_summary rollups

Revision ID: 0004_finance
Revises: 0003_phase3
Create Date: 2026-08-31

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004_finance"
down_revision: str | None = "0003_phase3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "monthly_financial_summary",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default=sa.text("'USD'"), nullable=False),
        sa.Column("revenue", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("cogs", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "operating_expense",
            sa.Numeric(14, 2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("gross_profit", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("net_profit", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("transaction_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("sale_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("purchase_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("expense_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id", "month", "currency", name="uq_monthly_financial_summary_scope"
        ),
    )
    op.create_index(
        "ix_monthly_financial_summary_tenant_month",
        "monthly_financial_summary",
        ["tenant_id", "month"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_monthly_financial_summary_tenant_month",
        table_name="monthly_financial_summary",
    )
    op.drop_table("monthly_financial_summary")