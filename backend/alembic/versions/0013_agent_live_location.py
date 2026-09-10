"""Add agent live GPS location fields to users

Revision ID: 0013_agent_live_location
Create Date: 2026-09-05
"""

import sqlalchemy as sa

from alembic import op

revision = "0013_agent_live_location"
down_revision = "0012_superadmin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("agent_lat", sa.Numeric(precision=9, scale=6), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("agent_lng", sa.Numeric(precision=9, scale=6), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "agent_location_updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "agent_location_updated_at")
    op.drop_column("users", "agent_lng")
    op.drop_column("users", "agent_lat")