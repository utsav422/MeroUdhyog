"""Customers: optional credit limit

Adds `credit_limit` to `customers` — the maximum amount a customer may owe at
once. It is nullable: `NULL` means no limit, so existing customers keep their
current behaviour and order creation never warns for them.

The used amount is not stored; it is derived from committed (non-cancelled,
non-failed) order totals minus active khata payments. See
`app/modules/customers/credit.py`.

Revision ID: 0026_customer_credit_limit
Revises: 0025_khata_bill_layouts
Create Date: 2026-10-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0026_customer_credit_limit"
down_revision: str | None = "0025_khata_bill_layouts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("credit_limit", sa.Numeric(14, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("customers", "credit_limit")