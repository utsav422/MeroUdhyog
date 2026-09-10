"""Add new roles (manager, worker, delivery) to the users role CHECK constraint

Revision ID: 0006_roles
Create Date: 2026-08-31
"""
from alembic import op

revision = "0006_roles"
down_revision = "0005_orders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('owner', 'admin', 'manager', 'accountant', 'worker', 'delivery', 'viewer')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('owner', 'admin', 'accountant', 'viewer')",
    )
