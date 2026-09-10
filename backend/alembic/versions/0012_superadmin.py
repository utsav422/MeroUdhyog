"""Add global is_superadmin flag to users (single platform superadmin)

Revision ID: 0012_superadmin
Create Date: 2026-09-03
"""

import sqlalchemy as sa

from alembic import op

revision = "0012_superadmin"
down_revision = "0011_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_superadmin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Enforce that there can only ever be a single platform superadmin.
    op.create_index(
        "uq_users_single_superadmin",
        "users",
        ["is_superadmin"],
        unique=True,
        postgresql_where=sa.text("is_superadmin"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_users_single_superadmin", table_name="users", postgresql_where=sa.text("is_superadmin")
    )
    op.drop_column("users", "is_superadmin")
