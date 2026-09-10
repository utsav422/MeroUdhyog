"""Add transaction_types table; seed default types; relax the hardcoded type CHECK

Revision ID: 0008_transaction_types
Create Date: 2026-09-02
"""

import uuid as _uuid
from contextlib import suppress

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0008_transaction_types"
down_revision = "0007_tenant_fks"
branch_labels = None
depends_on = None

DEFAULTS = (("Sale", "sale"), ("Purchase", "purchase"), ("Expense", "expense"))


def upgrade() -> None:
    op.create_table(
        "transaction_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "code", name="uq_transaction_types_tenant_code"),
    )
    op.create_index("ix_transaction_types_tenant_id", "transaction_types", ["tenant_id"])

    # Types are now tenant-defined, so the hardcoded CHECK no longer applies.
    with suppress(Exception):
        op.drop_constraint("ck_transactions_type", "transactions", type_="check")

    # Seed the default ledger types for every existing tenant.
    conn = op.get_bind()
    tenant_ids = conn.execute(sa.text("SELECT id FROM tenants")).fetchall()
    rows = [
        {
            "id": str(_uuid.uuid4()),
            "tenant_id": str(tid[0]),
            "name": name,
            "code": code,
        }
        for tid in tenant_ids
        for name, code in DEFAULTS
    ]
    if rows:
        conn.execute(
            sa.text(
                "INSERT INTO transaction_types "
                "(id, tenant_id, name, code, is_active, created_at, updated_at) "
                "VALUES (:id, :tenant_id, :name, :code, true, now(), now()) "
                "ON CONFLICT DO NOTHING"
            ),
            rows,
        )


def downgrade() -> None:
    with suppress(Exception):
        op.create_check_constraint(
            "ck_transactions_type",
            "transactions",
            "type IN ('sale', 'purchase', 'expense')",
        )
    op.drop_index("ix_transaction_types_tenant_id", table_name="transaction_types")
    op.drop_table("transaction_types")
