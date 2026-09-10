"""Add customer location, customer-specific pricing, and delivery routes

Revision ID: 0010_customer_routes_pricing
Create Date: 2026-09-02
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0010_customer_routes_pricing"
down_revision = "0009_audits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("city", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "customers",
        sa.Column("latitude", sa.Numeric(precision=9, scale=6), nullable=True),
    )
    op.add_column(
        "customers",
        sa.Column("longitude", sa.Numeric(precision=9, scale=6), nullable=True),
    )
    op.add_column(
        "customers",
        sa.Column("contact_number", sa.String(length=50), nullable=True),
    )

    op.create_table(
        "customer_prices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "customer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("product_variants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("price", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "currency",
            sa.String(length=3),
            nullable=False,
            server_default=sa.text("'USD'"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "tenant_id",
            "customer_id",
            "variant_id",
            name="uq_customer_prices_tenant_customer_variant",
        ),
    )
    op.create_index("ix_customer_prices_tenant_id", "customer_prices", ["tenant_id"])
    op.create_index(
        "ix_customer_prices_customer_variant",
        "customer_prices",
        ["tenant_id", "customer_id", "variant_id"],
    )

    op.create_table(
        "routes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_routes_tenant_id", "routes", ["tenant_id"])

    op.create_table(
        "route_cities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "route_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("routes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.UniqueConstraint("route_id", "city", name="uq_route_cities_route_city"),
    )
    op.create_index("ix_route_cities_tenant_id", "route_cities", ["tenant_id"])
    op.create_index("ix_route_cities_route_id", "route_cities", ["route_id"])
    op.create_index("ix_route_cities_city", "route_cities", ["tenant_id", "city"])

    op.create_table(
        "route_agents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "route_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("routes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("route_id", "agent_id", name="uq_route_agents_route_agent"),
    )
    op.create_index("ix_route_agents_tenant_id", "route_agents", ["tenant_id"])
    op.create_index("ix_route_agents_route_id", "route_agents", ["route_id"])
    op.create_index("ix_route_agents_agent_id", "route_agents", ["agent_id"])

    op.add_column(
        "deliveries",
        sa.Column("route_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_deliveries_route",
        "deliveries",
        "routes",
        ["route_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_deliveries_route", "deliveries", type_="foreignkey")
    op.drop_column("deliveries", "route_id")
    op.drop_table("route_agents")
    op.drop_table("route_cities")
    op.drop_table("routes")
    op.drop_table("customer_prices")
    op.drop_column("customers", "contact_number")
    op.drop_column("customers", "longitude")
    op.drop_column("customers", "latitude")
    op.drop_column("customers", "city")
