"""Khata: money recipient bill no on ledger entries

Adds `payer_bill_no` to `ledger_entries` — a bill/voucher number supplied by
the paying party when a payment is recorded. It is shown on the customer
ledger next to the receipt reference.

Revision ID: 0024_khata_payer_bill_no
Revises: 0023_notifications
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0024_khata_payer_bill_no"
down_revision: str | None = "0023_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ledger_entries",
        sa.Column("payer_bill_no", sa.String(length=40), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ledger_entries", "payer_bill_no")