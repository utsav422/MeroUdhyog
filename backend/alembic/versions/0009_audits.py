"""Add audit_runs and audit_findings (Phase 5 audit engine)

Revision ID: 0009_audits
Create Date: 2026-09-02
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0009_audits"
down_revision = "0008_transaction_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default=sa.text("'pending'")
        ),
        sa.Column("scope_month", sa.String(length=7), nullable=True),
        sa.Column("triggered_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("total_findings", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'completed', 'failed')", name="ck_audit_runs_status"
        ),
    )
    op.create_index("ix_audit_runs_tenant_created", "audit_runs", ["tenant_id", "created_at"])
    op.create_index("ix_audit_runs_tenant_id", "audit_runs", ["tenant_id"])

    op.create_table(
        "audit_findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("audit_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rule_code", sa.String(length=50), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column(
            "transaction_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transactions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("evidence", postgresql.JSONB(), nullable=True),
        sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "severity IN ('low', 'medium', 'high', 'critical')",
            name="ck_audit_findings_severity",
        ),
    )
    op.create_index(
        "ix_audit_findings_tenant_created", "audit_findings", ["tenant_id", "created_at"]
    )
    op.create_index(
        "ix_audit_findings_status_severity",
        "audit_findings",
        ["tenant_id", "is_resolved", "severity"],
    )
    op.create_index("ix_audit_findings_rule_code", "audit_findings", ["rule_code"])
    op.create_index("ix_audit_findings_tenant_id", "audit_findings", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("audit_findings")
    op.drop_table("audit_runs")
