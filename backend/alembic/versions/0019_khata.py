"""Khata: customer ledger, allocations, invoices, bill templates + collector role

Revision ID: 0019_khata
Create Date: 2026-09-13
"""

import json
import uuid as _uuid

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0019_khata"
down_revision = "0018_order_reorder"
branch_labels = None
depends_on = None

# Mirrors app.core.permissions.ROLE_PERMISSIONS["collector"].
COLLECTOR_JSON = json.dumps(["manage_khata"])


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "amount_paid",
            sa.Numeric(precision=14, scale=2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    op.create_table(
        "ledger_entries",
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
            sa.ForeignKey("customers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column(
            "collected_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("receipt_number", sa.String(length=40), nullable=True),
        sa.Column("receipt_snapshot", postgresql.JSON(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("voided_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_ledger_entries_tenant_customer", "ledger_entries", ["tenant_id", "customer_id"]
    )
    op.create_index(
        "ix_ledger_entries_tenant_collected", "ledger_entries", ["tenant_id", "collected_at"]
    )
    op.create_index("ix_ledger_entries_tenant_id", "ledger_entries", ["tenant_id"])

    op.create_table(
        "ledger_allocations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ledger_entry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ledger_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount_applied", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.UniqueConstraint(
            "tenant_id", "ledger_entry_id", "order_id", name="uq_allocations_entry_order"
        ),
    )
    op.create_index("ix_ledger_allocations_tenant_id", "ledger_allocations", ["tenant_id"])
    op.create_index("ix_ledger_allocations_order_id", "ledger_allocations", ["order_id"])

    op.create_table(
        "order_invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("invoice_number", sa.String(length=40), nullable=False),
        sa.Column("template_snapshot", postgresql.JSON(), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "order_id", name="uq_order_invoices_order"),
    )
    op.create_index("ix_order_invoices_tenant_id", "order_invoices", ["tenant_id"])

    op.create_table(
        "bill_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("business_name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("tax_id", sa.String(length=50), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("footer_note", sa.String(length=500), nullable=True),
        sa.Column(
            "invoice_number_prefix",
            sa.String(length=12),
            nullable=False,
            server_default="INV-",
        ),
        sa.Column(
            "receipt_number_prefix",
            sa.String(length=12),
            nullable=False,
            server_default="RCT-",
        ),
        sa.Column("next_invoice_number", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("next_receipt_number", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("logo_mime", sa.String(length=50), nullable=True),
        sa.Column("logo_data", sa.LargeBinary(), nullable=True),
        sa.Column("signature_mime", sa.String(length=50), nullable=True),
        sa.Column("signature_data", sa.LargeBinary(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", name="uq_bill_templates_tenant"),
    )
    op.create_index("ix_bill_templates_tenant_id", "bill_templates", ["tenant_id"])

    # Remove the role CHECK constraint entirely. The roles table is the source of
    # truth for valid codes; a hard-coded list blocks custom roles created via the
    # roles API (which is by design — see test_can_create_user_with_custom_role).
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM pg_constraint "
        "WHERE conrelid = 'users'::regclass AND conname = 'ck_users_role') THEN "
        "ALTER TABLE users DROP CONSTRAINT ck_users_role; "
        "END IF; END $$;"
    )

    # Seed the Collector role for every existing tenant. New tenants get it from
    # app.modules.roles.seed.seed_default_roles.
    conn = op.get_bind()
    tenant_ids = conn.execute(sa.text("SELECT id FROM tenants")).fetchall()
    rows = []
    for tid in tenant_ids:
        rows.append(
            {
                "id": str(_uuid.uuid4()),
                "tenant_id": str(tid[0]),
                "name": "Collector",
                "code": "collector",
                "description": "Built-in collector role",
                "permissions": COLLECTOR_JSON,
                "is_system": False,
            }
        )
    if rows:
        conn.execute(
            sa.text(
                "INSERT INTO roles "
                "(id, tenant_id, name, code, description, permissions, "
                "is_system, is_active, created_at, updated_at) "
                "VALUES (:id, :tenant_id, :name, :code, :description, "
                "CAST(:permissions AS jsonb), :is_system, true, now(), now()) "
                "ON CONFLICT (tenant_id, code) DO NOTHING"
            ),
            rows,
        )


def downgrade() -> None:
    op.drop_table("bill_templates")
    op.drop_table("order_invoices")
    op.drop_table("ledger_allocations")
    op.drop_table("ledger_entries")
    op.drop_column("orders", "amount_paid")