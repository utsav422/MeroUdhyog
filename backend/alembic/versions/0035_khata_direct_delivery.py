"""Tag orders created as direct/backdated khata deliveries

Revision ID: 0035_khata_direct_delivery
Revises: 0034_user_profile
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0035_khata_direct_delivery"
down_revision: str | None = "0034_user_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "source",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'order'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("orders", "source")
