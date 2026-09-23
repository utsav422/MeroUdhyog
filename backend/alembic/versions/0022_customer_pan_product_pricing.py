"""Customers: tax_id -> pan_no; drop wholesale_price & mrp_price

Revision ID: 0022_customer_pan_product_pricing
Revises: 0021_khata_invoice_tax
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0022_customer_pan_product_pricing"
down_revision: str | None = "0021_khata_invoice_tax"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("customers", "tax_id", new_column_name="pan_no")
    op.drop_constraint("uq_customers_tenant_tax_id", "customers", type_="unique")
    op.create_unique_constraint(
        "uq_customers_tenant_pan_no", "customers", ["tenant_id", "pan_no"]
    )
    op.drop_column("variant_prices", "mrp_price")
    op.drop_column("variant_prices", "wholesale_price")


def downgrade() -> None:
    op.add_column(
        "variant_prices",
        sa.Column("wholesale_price", sa.Numeric(14, 2), nullable=True),
    )
    op.add_column(
        "variant_prices",
        sa.Column("mrp_price", sa.Numeric(14, 2), nullable=True),
    )
    op.drop_constraint("uq_customers_tenant_pan_no", "customers", type_="unique")
    op.create_unique_constraint(
        "uq_customers_tenant_tax_id", "customers", ["tenant_id", "tax_id"]
    )
    op.alter_column("customers", "pan_no", new_column_name="tax_id")