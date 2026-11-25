"""Soft delete, recovery items and dependency-aware retention

Revision ID: 0036_recovery_soft_delete
Revises: 0035_khata_direct_delivery
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0036_recovery_soft_delete"
down_revision: str | None = "0035_khata_direct_delivery"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SOFT_DELETE_TABLES = (
    "customers",
    "orders",
    "deliveries",
    "ledger_entries",
    "products",
    "product_variants",
    "users",
    "categories",
)

UNIQUE_TO_PARTIAL = (
    ("customers", "uq_customers_tenant_email", ("tenant_id", "email")),
    ("customers", "uq_customers_tenant_pan_no", ("tenant_id", "pan_no")),
    ("orders", "uq_orders_tenant_ref", ("tenant_id", "order_ref")),
    ("deliveries", "uq_deliveries_order", ("order_id",)),
    ("products", "uq_products_tenant_sku", ("tenant_id", "sku")),
    ("products", "uq_products_tenant_slug", ("tenant_id", "slug")),
    ("product_variants", "uq_variants_tenant_product_sku", ("tenant_id", "product_id", "sku")),
    ("users", "uq_users_tenant_email", ("tenant_id", "email")),
    ("categories", "uq_categories_tenant_slug", ("tenant_id", "slug")),
)


def upgrade() -> None:
    for table in SOFT_DELETE_TABLES:
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(
            table, sa.Column("deleted_by", postgresql.UUID(as_uuid=True), nullable=True)
        )
        op.add_column(
            table,
            sa.Column("delete_batch_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_index(f"ix_{table}_deleted_at", table, ["deleted_at"])
        op.create_index(f"ix_{table}_delete_batch_id", table, ["delete_batch_id"])

    for table, name, columns in UNIQUE_TO_PARTIAL:
        op.drop_constraint(name, table, type_="unique")
        op.create_index(
            name,
            table,
            list(columns),
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL"),
        )

    op.create_table(
        "recovery_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_type", sa.String(length=30), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("detail", postgresql.JSONB(), nullable=False),
        sa.Column("depends_on", sa.JSON(), nullable=False),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False, server_default="trashed"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("restored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("purged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_recovery_items_tenant_id", "recovery_items", ["tenant_id"])
    op.create_index(
        "ix_recovery_tenant_type_deleted",
        "recovery_items",
        ["tenant_id", "entity_type", "deleted_at"],
    )
    op.create_index("ix_recovery_batch", "recovery_items", ["tenant_id", "batch_id"])
    op.create_index(
        "uq_recovery_active_item",
        "recovery_items",
        ["tenant_id", "entity_type", "entity_id"],
        unique=True,
        postgresql_where=sa.text("state = 'trashed'"),
    )


def downgrade() -> None:
    op.drop_index("uq_recovery_active_item", table_name="recovery_items")
    op.drop_index("ix_recovery_batch", table_name="recovery_items")
    op.drop_index("ix_recovery_tenant_type_deleted", table_name="recovery_items")
    op.drop_index("ix_recovery_items_tenant_id", table_name="recovery_items")
    op.drop_table("recovery_items")

    inspector = sa.inspect(op.get_bind())
    for table, name, columns in UNIQUE_TO_PARTIAL:
        names = {item.get("name") for item in inspector.get_unique_constraints(table)}
        if name in names:
            op.drop_constraint(name, table, type_="unique")
        elif any(
            item.get("name") == name for item in inspector.get_indexes(table)
        ):
            op.drop_index(name, table_name=table)
        op.create_unique_constraint(name, table, list(columns))

    for table in SOFT_DELETE_TABLES:
        op.drop_index(f"ix_{table}_delete_batch_id", table_name=table)
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_column(table, "delete_batch_id")
        op.drop_column(table, "deleted_by")
        op.drop_column(table, "deleted_at")
