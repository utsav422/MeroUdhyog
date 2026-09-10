"""Create tenant-scoped roles table; seed built-in roles for existing tenants

Revision ID: 0011_roles
Create Date: 2026-09-02
"""

import json
import uuid as _uuid
from contextlib import suppress

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0011_roles"
down_revision = "0010_customer_routes_pricing"
branch_labels = None
depends_on = None

# Mirrors app.core.permissions.ROLE_PERMISSIONS (value strings) for seeding.
BUILTIN_ROLES = {
    "owner": [
        "manage_users", "view_all", "import_data", "manage_settings", "manage_catalog",
        "manage_customers", "manage_transactions", "manage_orders", "manage_audits",
        "view_assigned_deliveries", "update_delivery_status",
    ],
    "admin": [
        "manage_users", "view_all", "import_data", "manage_settings", "manage_catalog",
        "manage_customers", "manage_transactions", "manage_orders", "manage_audits",
        "update_delivery_status",
    ],
    "manager": ["view_all", "manage_catalog", "manage_customers", "manage_orders", "update_delivery_status"],
    "accountant": ["view_all", "import_data", "manage_transactions", "manage_audits", "view_assigned_deliveries"],
    "worker": ["view_all", "manage_orders"],
    "delivery": ["view_assigned_deliveries", "update_delivery_status"],
    "viewer": ["view_all"],
}


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("permissions", postgresql.JSONB(), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "code", name="uq_roles_tenant_code"),
    )
    op.create_index("ix_roles_tenant_id", "roles", ["tenant_id"])

    conn = op.get_bind()
    tenant_ids = conn.execute(sa.text("SELECT id FROM tenants")).fetchall()
    rows = []
    for tid in tenant_ids:
        for code, perms in BUILTIN_ROLES.items():
            rows.append(
                {
                    "id": str(_uuid.uuid4()),
                    "tenant_id": str(tid[0]),
                    "name": code.title(),
                    "code": code,
                    "description": f"Built-in {code} role",
                    "permissions": json.dumps(perms),
                    "is_system": code == "owner",
                }
            )
    if rows:
        conn.execute(
            sa.text(
                "INSERT INTO roles "
                "(id, tenant_id, name, code, description, permissions, is_system, is_active, created_at, updated_at) "
                "VALUES (:id, :tenant_id, :name, :code, :description, "
                "CAST(:permissions AS jsonb), :is_system, true, now(), now()) "
                "ON CONFLICT DO NOTHING"
            ),
            rows,
        )

    with suppress(Exception):
        op.drop_constraint("ck_users_role", "users", type_="check")


def downgrade() -> None:
    with suppress(Exception):
        op.create_check_constraint(
            "ck_users_role", "users", "role IN ('owner', 'admin', 'accountant', 'viewer')"
        )
    op.drop_index("ix_roles_tenant_id", table_name="roles")
    op.drop_table("roles")
