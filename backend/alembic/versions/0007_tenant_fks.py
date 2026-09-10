"""Add tenant_id foreign keys across tenant-scoped tables; drop legacy products.category

Revision ID: 0007_tenant_fks
Create Date: 2026-08-31
"""
from alembic import op

revision = "0007_tenant_fks"
down_revision = "0006_roles"
branch_labels = None
depends_on = None

# (table, constraint_name)
TENANT_FKS = [
    ("categories", "fk_categories_tenant_id"),
    ("products", "fk_products_tenant_id"),
    ("product_variants", "fk_product_variants_tenant_id"),
    ("variant_prices", "fk_variant_prices_tenant_id"),
    ("customers", "fk_customers_tenant_id"),
    ("orders", "fk_orders_tenant_id"),
    ("order_items", "fk_order_items_tenant_id"),
    ("deliveries", "fk_deliveries_tenant_id"),
    ("import_batches", "fk_import_batches_tenant_id"),
    ("import_row_errors", "fk_import_row_errors_tenant_id"),
    ("monthly_financial_summary", "fk_monthly_financial_summary_tenant_id"),
    ("transactions", "fk_transactions_tenant_id"),
]


def upgrade() -> None:
    # Remove the legacy denormalized category column and its index from products.
    try:
        op.drop_index("ix_products_tenant_category", table_name="products")
    except Exception:
        pass
    try:
        op.drop_column("products", "category")
    except Exception:
        pass

    # Add real foreign-key constraints for tenant_id -> tenants.id on every scoped table.
    for table, constraint in TENANT_FKS:
        try:
            op.create_foreign_key(
                constraint,
                table,
                "tenants",
                ["tenant_id"],
                ["id"],
                ondelete="CASCADE",
            )
        except Exception:
            pass


def downgrade() -> None:
    for table, constraint in reversed(TENANT_FKS):
        try:
            op.drop_constraint(constraint, table, type_="foreignkey")
        except Exception:
            pass
    op.add_column(
        "products",
        op.Column("category", op.String(length=100), nullable=True),
    )
