"""Khata: invoice tax + editable invoice document data

Revision ID: 0021_khata_invoice_tax
Create Date: 2026-09-26
"""

import sqlalchemy as sa

from alembic import op

revision = "0021_khata_invoice_tax"
down_revision = "0020_khata_layout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bill_templates",
        sa.Column(
            "invoice_tax_rate",
            sa.Numeric(precision=6, scale=2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "order_invoices",
        sa.Column("data", sa.JSON(), nullable=True),
    )
    op.add_column(
        "order_invoices",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("order_invoices", "updated_at")
    op.drop_column("order_invoices", "data")
    op.drop_column("bill_templates", "invoice_tax_rate")
