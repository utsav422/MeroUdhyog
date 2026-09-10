"""Phase 5: Categories, Orders, Deliveries + product variant enrichment

Revision ID: 0005_orders
Create Date: 2026-08-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision = "0005_orders"
down_revision = "0004_finance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── categories ──
    op.create_table(
        "categories",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", PGUUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_categories_tenant_slug"),
        sa.Index("ix_categories_tenant_id", "tenant_id"),
    )

    # ── ALTER products: add category_id FK + slug ──
    op.add_column("products", sa.Column("category_id", PGUUID(as_uuid=True), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True))
    op.add_column("products", sa.Column("slug", sa.String(120), nullable=True))
    op.create_unique_constraint("uq_products_tenant_slug", "products", ["tenant_id", "slug"])
    op.create_index("ix_products_category_id", "products", ["category_id"])

    # ── ALTER product_variants: add size, size_type, images ──
    op.add_column("product_variants", sa.Column("size", sa.String(50), nullable=True))
    op.add_column("product_variants", sa.Column("size_type", sa.String(30), nullable=True))
    op.add_column("product_variants", sa.Column("images", sa.JSON(), nullable=True, server_default=sa.text("'[]'::json")))

    # ── ALTER variant_prices: add wholesale_price, cost_price, mrp_price ──
    op.add_column("variant_prices", sa.Column("wholesale_price", sa.Numeric(14, 2), nullable=True))
    op.add_column("variant_prices", sa.Column("cost_price", sa.Numeric(14, 2), nullable=True))
    op.add_column("variant_prices", sa.Column("mrp_price", sa.Numeric(14, 2), nullable=True))

    # ── orders ──
    op.create_table(
        "orders",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", PGUUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_ref", sa.String(30), nullable=False),
        sa.Column("customer_id", PGUUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("payment_status", sa.String(20), nullable=False, server_default="unpaid"),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("delivery_address", sa.Text(), nullable=True),
        sa.Column("delivery_lat", sa.Numeric(9, 6), nullable=True),
        sa.Column("delivery_lng", sa.Numeric(9, 6), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", PGUUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "order_ref", name="uq_orders_tenant_ref"),
        sa.Index("ix_orders_tenant_id", "tenant_id"),
        sa.Index("ix_orders_tenant_status", "tenant_id", "status"),
        sa.Index("ix_orders_tenant_customer", "tenant_id", "customer_id"),
    )

    # ── order_items ──
    op.create_table(
        "order_items",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", PGUUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", PGUUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", PGUUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("variant_id", PGUUID(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_name", sa.String(200), nullable=False),
        sa.Column("variant_name", sa.String(200), nullable=True),
        sa.Column("quantity", sa.Numeric(14, 4), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Index("ix_order_items_order_id", "order_id"),
        sa.Index("ix_order_items_tenant_id", "tenant_id"),
    )

    # ── deliveries ──
    op.create_table(
        "deliveries",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", PGUUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", PGUUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("delivery_agent_id", PGUUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending_assignment"),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("picked_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_lat", sa.Numeric(9, 6), nullable=True),
        sa.Column("delivered_lng", sa.Numeric(9, 6), nullable=True),
        sa.Column("proof_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("order_id", name="uq_deliveries_order"),
        sa.Index("ix_deliveries_tenant_id", "tenant_id"),
        sa.Index("ix_deliveries_agent", "delivery_agent_id"),
    )

    # ── delivery_locations ──
    op.create_table(
        "delivery_locations",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("delivery_id", PGUUID(as_uuid=True), sa.ForeignKey("deliveries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lat", sa.Numeric(9, 6), nullable=False),
        sa.Column("lng", sa.Numeric(9, 6), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Index("ix_delivery_locations_delivery", "delivery_id", "recorded_at"),
    )


def downgrade() -> None:
    op.drop_table("delivery_locations")
    op.drop_table("deliveries")
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_column("variant_prices", "mrp_price")
    op.drop_column("variant_prices", "cost_price")
    op.drop_column("variant_prices", "wholesale_price")
    op.drop_column("product_variants", "images")
    op.drop_column("product_variants", "size_type")
    op.drop_column("product_variants", "size")
    op.drop_constraint("uq_products_tenant_slug", "products", type_="unique")
    op.drop_index("ix_products_category_id", "products")
    op.drop_column("products", "slug")
    op.drop_column("products", "category_id")
    op.drop_table("categories")
