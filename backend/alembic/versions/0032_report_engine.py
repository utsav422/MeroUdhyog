"""Add the report engine cutover flag

Lets a tenant keep using the legacy derived statements until it has reviewed
the GL reconciliation, then switch the UI to the double-entry reports.

Revision ID: 0032_report_engine
Revises: 0031_journal_active_source
Create Date: 2026-11-13
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0032_report_engine"
down_revision: str | None = "0031_journal_active_source"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "accounting_settings",
        sa.Column(
            "report_engine",
            sa.String(length=10),
            nullable=False,
            server_default=sa.text("'legacy'"),
        ),
    )
    op.create_check_constraint(
        "ck_accounting_settings_report_engine",
        "accounting_settings",
        "report_engine IN ('legacy', 'gl')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_accounting_settings_report_engine",
        "accounting_settings",
        type_="check",
    )
    op.drop_column("accounting_settings", "report_engine")
