"""Notifications: in-app + Web Push subscriptions

Revision ID: 0023_notifications
Revises: 0022_customer_pan_product_pricing
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0023_notifications"
down_revision: str | None = "0022_customer_pan_product_pricing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipient_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("recipient_roles", postgresql.JSONB, nullable=True),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("link", sa.String(300), nullable=True),
        sa.Column("data", postgresql.JSONB, nullable=True),
        sa.Column("dedupe_key", sa.String(200), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_notifications_tenant_created",
        "notifications",
        ["tenant_id", "created_at"],
    )
    op.create_index(
        "ix_notifications_recipient_user", "notifications", ["recipient_user_id"]
    )
    op.create_index(
        "ix_notifications_recipient_roles", "notifications", ["recipient_roles"]
    )
    op.create_unique_constraint(
        "uq_notifications_tenant_dedupe",
        "notifications",
        ["tenant_id", "dedupe_key"],
    )
    op.create_index(
        "uq_notifications_unread_dedupe",
        "notifications",
        ["dedupe_key"],
        unique=True,
        postgresql_where=sa.text("dedupe_key IS NOT NULL AND read_at IS NULL"),
    )

    op.create_table(
        "push_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(1024), nullable=False),
        sa.Column("auth", sa.String(256), nullable=False),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_unique_constraint(
        "uq_push_subscriptions_endpoint",
        "push_subscriptions",
        ["tenant_id", "endpoint"],
    )
    op.create_index(
        "ix_push_subscriptions_user", "push_subscriptions", ["user_id"]
    )


def downgrade() -> None:
    op.drop_table("push_subscriptions")
    op.drop_table("notifications")