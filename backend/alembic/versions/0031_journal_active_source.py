"""One active journal entry per source record

Adds a partial unique index so automatic postings are idempotent per source
transaction while still allowing a voided entry to be replaced by a new one.

Revision ID: 0031_journal_active_source
Revises: 0030_accounting_ledger
Create Date: 2026-11-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0031_journal_active_source"
down_revision: str | None = "0030_accounting_ledger"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "uq_journal_entries_active_source",
        "journal_entries",
        ["tenant_id", "source_type", "source_id"],
        unique=True,
        postgresql_where=sa.text("source_type IS NOT NULL AND status <> 'void'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_journal_entries_active_source", table_name="journal_entries"
    )
