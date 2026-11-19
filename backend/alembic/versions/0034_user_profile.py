"""Add self-service profile fields to users

Adds an optional avatar and saved map coordinates for the authenticated
user's profile. Delivery live-tracking coordinates remain in agent_lat/lng.

Revision ID: 0034_user_profile
Revises: 0033_inventory_tax_bank
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0034_user_profile"
down_revision: str | None = "0033_inventory_tax_bank"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("latitude", sa.Numeric(9, 6), nullable=True))
    op.add_column("users", sa.Column("longitude", sa.Numeric(9, 6), nullable=True))
    op.add_column("users", sa.Column("avatar_mime", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("avatar_data", sa.LargeBinary(), nullable=True))
    op.add_column(
        "users",
        sa.Column("avatar_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "avatar_updated_at")
    op.drop_column("users", "avatar_data")
    op.drop_column("users", "avatar_mime")
    op.drop_column("users", "longitude")
    op.drop_column("users", "latitude")
