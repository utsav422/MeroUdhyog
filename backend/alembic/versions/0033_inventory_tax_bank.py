"""Inventory valuation, TDS and bank reconciliation

Adds moving weighted-average inventory costs, TDS amounts and the bank
statement reconciliation tables. Existing tenants receive the TDS receivable
account and a best-effort cost backfill from their latest variant price.

Revision ID: 0033_inventory_tax_bank
Revises: 0032_report_engine
Create Date: 2026-11-13
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.modules.accounting.coa import DEFAULT_ACCOUNTS

revision: str = "0033_inventory_tax_bank"
down_revision: str | None = "0032_report_engine"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _backfill_tds_account() -> None:
    spec = next(item for item in DEFAULT_ACCOUNTS if item.code == "1085")
    bind = op.get_bind()
    tenant_ids = bind.execute(sa.text("SELECT id FROM tenants")).scalars().all()
    for tenant_id in tenant_ids:
        parent_id = bind.execute(
            sa.text(
                "SELECT id FROM accounts "
                "WHERE tenant_id = :tenant_id AND code = '1000'"
            ),
            {"tenant_id": tenant_id},
        ).scalar_one_or_none()
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM accounts "
                "WHERE tenant_id = :tenant_id AND code = '1085'"
            ),
            {"tenant_id": tenant_id},
        ).scalar_one_or_none()
        if exists:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO accounts ("
                "id, tenant_id, code, name, account_type, normal_balance, "
                "parent_id, is_group, is_system, is_active, created_at, updated_at"
                ") VALUES ("
                ":id, :tenant_id, :code, :name, :account_type, :normal_balance, "
                ":parent_id, false, true, true, now(), now()"
                ")"
            ),
            {
                "id": uuid.uuid4(),
                "tenant_id": tenant_id,
                "code": spec.code,
                "name": spec.name,
                "account_type": spec.account_type,
                "normal_balance": spec.normal_balance,
                "parent_id": parent_id,
            },
        )


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("tds_amount", sa.Numeric(14, 2), nullable=True),
    )
    op.add_column(
        "product_variants",
        sa.Column(
            "average_cost",
            sa.Numeric(14, 4),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "inventory_movements",
        sa.Column("unit_cost", sa.Numeric(14, 4), nullable=True),
    )
    op.add_column(
        "inventory_movements",
        sa.Column("total_cost", sa.Numeric(14, 2), nullable=True),
    )
    op.add_column(
        "inventory_movements",
        sa.Column("transaction_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_inventory_movements_transaction_id",
        "inventory_movements",
        "transactions",
        ["transaction_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_inventory_movements_transaction_id",
        "inventory_movements",
        ["transaction_id"],
    )

    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("bank_name", sa.String(length=100), nullable=True),
        sa.Column("account_number", sa.String(length=50), nullable=True),
        sa.Column(
            "currency",
            sa.String(length=3),
            server_default=sa.text("'NPR'"),
            nullable=False,
        ),
        sa.Column("gl_account_id", sa.Uuid(), nullable=False),
        sa.Column(
            "opening_balance",
            sa.Numeric(16, 2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["gl_account_id"], ["accounts.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id", "name", name="uq_bank_accounts_tenant_name"
        ),
    )
    op.create_index("ix_bank_accounts_tenant_id", "bank_accounts", ["tenant_id"])
    op.create_index(
        "ix_bank_accounts_tenant_gl",
        "bank_accounts",
        ["tenant_id", "gl_account_id"],
    )

    op.create_table(
        "bank_statement_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("bank_account_id", sa.Uuid(), nullable=False),
        sa.Column("statement_date", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("reference", sa.String(length=100), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'unmatched'"),
            nullable=False,
        ),
        sa.Column("matched_entry_id", sa.Uuid(), nullable=True),
        sa.Column("matched_line_id", sa.Uuid(), nullable=True),
        sa.Column("matched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("matched_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["bank_account_id"], ["bank_accounts.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["matched_entry_id"], ["journal_entries.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["matched_line_id"], ["journal_lines.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["matched_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('unmatched', 'matched')",
            name="ck_bank_statement_lines_status",
        ),
    )
    op.create_index(
        "ix_bank_statement_lines_tenant_id", "bank_statement_lines", ["tenant_id"]
    )
    op.create_index(
        "ix_bank_statement_lines_account_date",
        "bank_statement_lines",
        ["bank_account_id", "statement_date"],
    )
    op.create_index(
        "ix_bank_statement_lines_tenant_status",
        "bank_statement_lines",
        ["tenant_id", "status"],
    )

    op.execute(
        """
        UPDATE product_variants AS v
        SET average_cost = p.cost_price
        FROM (
            SELECT DISTINCT ON (variant_id) variant_id, cost_price
            FROM variant_prices
            WHERE cost_price IS NOT NULL
            ORDER BY variant_id, effective_from DESC NULLS LAST, created_at DESC
        ) AS p
        WHERE p.variant_id = v.id AND v.average_cost = 0
        """
    )
    op.execute(
        """
        UPDATE inventory_movements AS m
        SET unit_cost = v.average_cost
        FROM product_variants AS v
        WHERE v.id = m.variant_id AND m.unit_cost IS NULL
        """
    )
    op.execute(
        """
        UPDATE inventory_movements
        SET total_cost = ROUND(unit_cost * quantity, 2)
        WHERE total_cost IS NULL AND unit_cost IS NOT NULL
        """
    )
    _backfill_tds_account()


def downgrade() -> None:
    op.drop_index(
        "ix_bank_statement_lines_tenant_status", table_name="bank_statement_lines"
    )
    op.drop_index(
        "ix_bank_statement_lines_account_date", table_name="bank_statement_lines"
    )
    op.drop_index(
        "ix_bank_statement_lines_tenant_id", table_name="bank_statement_lines"
    )
    op.drop_table("bank_statement_lines")
    op.drop_index("ix_bank_accounts_tenant_gl", table_name="bank_accounts")
    op.drop_index("ix_bank_accounts_tenant_id", table_name="bank_accounts")
    op.drop_table("bank_accounts")
    op.drop_index(
        "ix_inventory_movements_transaction_id", table_name="inventory_movements"
    )
    op.drop_constraint(
        "fk_inventory_movements_transaction_id",
        "inventory_movements",
        type_="foreignkey",
    )
    op.drop_column("inventory_movements", "transaction_id")
    op.drop_column("inventory_movements", "total_cost")
    op.drop_column("inventory_movements", "unit_cost")
    op.drop_column("product_variants", "average_cost")
    op.drop_column("transactions", "tds_amount")
    op.execute(
        "DELETE FROM accounts WHERE code = '1085' AND is_system = true"
    )
