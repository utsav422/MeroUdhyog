"""Add order history for prediction engine

Revision ID: 0016_predictions
Create Date: 2026-09-07
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0016_predictions"
down_revision = "0015_routes_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "order_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", UUID(as_uuid=True), nullable=False),
        sa.Column("variant_id", UUID(as_uuid=True), nullable=True),
        sa.Column("order_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 4), nullable=False),
        sa.Column(
            "source",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'csv'"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["variant_id"], ["product_variants.id"], ondelete="SET NULL"
        ),
    )
    op.create_index("ix_order_history_tenant_id", "order_history", ["tenant_id"])
    op.create_index(
        "ix_order_history_tenant_customer", "order_history", ["tenant_id", "customer_id"]
    )
    op.create_index(
        "ix_order_history_tenant_product", "order_history", ["tenant_id", "product_id"]
    )
    op.create_index(
        "ix_order_history_tenant_date", "order_history", ["tenant_id", "order_date"]
    )


def downgrade() -> None:
    op.drop_index("ix_order_history_tenant_date", table_name="order_history")
    op.drop_index("ix_order_history_tenant_product", table_name="order_history")
    op.drop_index("ix_order_history_tenant_customer", table_name="order_history")
    op.drop_index("ix_order_history_tenant_id", table_name="order_history")
    op.drop_table("order_history")