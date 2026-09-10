"""Add per-variant stock + inventory movement audit trail

Revision ID: 0014_stock_management
Create Date: 2026-09-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0014_stock_management"
down_revision = "0013_agent_live_location"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "product_variants",
        sa.Column(
            "stock_quantity",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "product_variants",
        sa.Column(
            "low_stock_threshold",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("5"),
        ),
    )
    op.create_table(
        "inventory_movements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("variant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", UUID(as_uuid=True), nullable=False),
        sa.Column("product_name", sa.String(200), nullable=False),
        sa.Column("variant_name", sa.String(200), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "reason",
            sa.String(30),
            nullable=False,
            server_default=sa.text("'order'"),
        ),
        sa.Column("order_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["variant_id"], ["product_variants.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_inventory_movements_tenant_id", "inventory_movements", ["tenant_id"]
    )
    op.create_index(
        "ix_inventory_movements_variant_id", "inventory_movements", ["variant_id"]
    )
    op.create_index(
        "ix_inventory_movements_created_at", "inventory_movements", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_inventory_movements_created_at", table_name="inventory_movements")
    op.drop_index("ix_inventory_movements_variant_id", table_name="inventory_movements")
    op.drop_index("ix_inventory_movements_tenant_id", table_name="inventory_movements")
    op.drop_table("inventory_movements")
    op.drop_column("product_variants", "low_stock_threshold")
    op.drop_column("product_variants", "stock_quantity")