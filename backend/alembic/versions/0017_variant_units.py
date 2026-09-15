"""Add pricing unit to product variants and order items

Revision ID: 0017_variant_units
Create Date: 2026-09-13
"""

import sqlalchemy as sa

from alembic import op

revision = "0017_variant_units"
down_revision = "0016_predictions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "product_variants",
        sa.Column("unit", sa.String(30), nullable=True),
    )
    op.add_column(
        "order_items",
        sa.Column("unit", sa.String(30), nullable=True),
    )
    # Backfill order line units from the variant they reference so existing
    # orders render "price / unit" without manual edits.
    op.execute(
        """
        UPDATE order_items oi
        SET unit = pv.unit
        FROM product_variants pv
        WHERE oi.variant_id = pv.id
        """
    )


def downgrade() -> None:
    op.drop_column("order_items", "unit")
    op.drop_column("product_variants", "unit")