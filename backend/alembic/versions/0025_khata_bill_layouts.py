"""Khata: bill layout presets (multiple saved layouts + per-doc defaults)

Revision ID: 0025_khata_bill_layouts
Revises: 0024_khata_payer_bill_no
Create Date: 2026-10-01
"""

import json
import uuid as _uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0025_khata_bill_layouts"
down_revision: str | None = "0024_khata_payer_bill_no"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The app's current default layout, used when a bill template has no layout yet.
    from app.modules.khata.layout import default_layout

    DEFAULT_LAYOUT_JSON = json.dumps(default_layout())

    op.create_table(
        "bill_layouts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("layout", postgresql.JSON(), nullable=False),
        sa.Column(
            "is_default_invoice",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_default_receipt",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.UniqueConstraint("tenant_id", "name", name="uq_bill_layouts_tenant_name"),
    )
    op.create_index("ix_bill_layouts_tenant_id", "bill_layouts", ["tenant_id"])
    op.create_index(
        "uq_bill_layouts_one_invoice_default",
        "bill_layouts",
        ["tenant_id"],
        unique=True,
        postgresql_where=sa.text("is_default_invoice = true"),
    )
    op.create_index(
        "uq_bill_layouts_one_receipt_default",
        "bill_layouts",
        ["tenant_id"],
        unique=True,
        postgresql_where=sa.text("is_default_receipt = true"),
    )

    # Data migration: for every existing bill template, seed one "Standard"
    # preset copying its current layout and make it the default for both
    # invoices and receipts. Tenants without a template get their "Standard"
    # lazily on first use (see KhataService.get_default_layout).
    conn = op.get_bind()
    templates = conn.execute(
        sa.text("SELECT id, tenant_id, layout FROM bill_templates")
    ).fetchall()
    rows = []
    for template_id, tenant_id, layout in templates:
        rows.append(
            {
                "id": str(_uuid.uuid4()),
                "tenant_id": str(tenant_id),
                "layout": json.dumps(layout) if layout else DEFAULT_LAYOUT_JSON,
            }
        )
    if rows:
        conn.execute(
            sa.text(
                "INSERT INTO bill_layouts "
                "(id, tenant_id, name, layout, is_default_invoice, "
                "is_default_receipt, created_at, updated_at) "
                "VALUES (:id, :tenant_id, 'Standard', CAST(:layout AS json), "
                "true, true, now(), now()) "
                "ON CONFLICT DO NOTHING"
            ),
            rows,
        )


def downgrade() -> None:
    op.drop_table("bill_layouts")