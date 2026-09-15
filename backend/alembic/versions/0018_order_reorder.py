"""Track order re-orders and their cancellation history

Revision ID: 0018_order_reorder
Create Date: 2026-09-13
"""

import sqlalchemy as sa

from alembic import op

revision = "0018_order_reorder"
down_revision = "0017_variant_units"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "reorder_of_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "orders",
        sa.Column("reorder_attempt", sa.Integer(), nullable=True),
    )
    op.create_index("ix_orders_reorder_of", "orders", ["reorder_of_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_reorder_of", table_name="orders")
    op.drop_column("orders", "reorder_attempt")
    op.drop_column("orders", "reorder_of_id")