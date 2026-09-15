"""Khata: bill template layout config

Revision ID: 0020_khata_layout
Create Date: 2026-09-13
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0020_khata_layout"
down_revision = "0019_khata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bill_templates",
        sa.Column("layout", postgresql.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bill_templates", "layout")