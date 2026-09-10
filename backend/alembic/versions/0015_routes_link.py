"""Link routes to customers and orders

Revision ID: 0015_routes_link
Create Date: 2026-09-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0015_routes_link"
down_revision = "0014_stock_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("route_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_customers_route_id",
        "customers",
        "routes",
        ["route_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_customers_route_id", "customers", ["route_id"])

    op.add_column(
        "orders",
        sa.Column("route_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_orders_route_id",
        "orders",
        "routes",
        ["route_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_orders_route_id", "orders", ["route_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_route_id", table_name="orders")
    op.drop_constraint("fk_orders_route_id", "orders", type_="foreignkey")
    op.drop_column("orders", "route_id")

    op.drop_index("ix_customers_route_id", table_name="customers")
    op.drop_constraint("fk_customers_route_id", "customers", type_="foreignkey")
    op.drop_column("customers", "route_id")