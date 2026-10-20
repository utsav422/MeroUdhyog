"""Accounting: post khata payments into the ledger + add the `receipt` type

The accounting statements (trial balance, P&L, balance sheet, cash flow) read
the `transactions` ledger as their single source of truth. Until now, khata
customer payments were invisible there, which made the cash-flow statement
wrong. This migration:

  1. Adds a `Receipt` transaction type for every existing tenant.
  2. Backfills a `receipt` transaction for every already-recorded, active khata
     payment (``ledger_entries`` with ``status='active'``) that does not yet have
     one, using ``external_id = 'khata-receipt:<ledger_entry_id>'`` so future
     posts stay idempotent.
  3. Backfills a reversing receipt for every voided payment whose original
     receipt exists.

Revision ID: 0028_khata_receipts_in_ledger
Revises: 0027_auth_email_tokens
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0028_khata_receipts_in_ledger"
down_revision: str | None = "0027_auth_email_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Seed the Receipt type for tenants that do not have it yet.
    conn.execute(
        sa.text(
            """
            INSERT INTO transaction_types (id, tenant_id, name, code, is_active, created_at, updated_at)
            SELECT gen_random_uuid(), t.id, 'Receipt', 'receipt', true, now(), now()
            FROM tenants t
            WHERE NOT EXISTS (
                SELECT 1 FROM transaction_types tt
                WHERE tt.tenant_id = t.id AND tt.code = 'receipt'
            )
            """
        )
    )

    # 2. Backfill active payments as receipt transactions.
    conn.execute(
        sa.text(
            """
            INSERT INTO transactions (
                id, tenant_id, type, transaction_date, external_id, amount,
                currency, description, customer_id, metadata, is_active,
                created_at, updated_at
            )
            SELECT
                gen_random_uuid(),
                le.tenant_id,
                'receipt',
                le.collected_at,
                'khata-receipt:' || le.id::text,
                le.amount,
                'NPR',
                'Payment received (backfill)',
                le.customer_id,
                jsonb_build_object('ledger_entry_id', le.id::text, 'method', le.method, 'backfilled', true),
                true,
                now(),
                now()
            FROM ledger_entries le
            WHERE le.status = 'active'
              AND NOT EXISTS (
                  SELECT 1 FROM transactions t
                  WHERE t.tenant_id = le.tenant_id
                    AND t.external_id = 'khata-receipt:' || le.id::text
              )
            """
        )
    )

    # 3. Backfill reversal receipts for voided payments whose original exists.
    conn.execute(
        sa.text(
            """
            INSERT INTO transactions (
                id, tenant_id, type, transaction_date, external_id, amount,
                currency, description, customer_id, reverses_id, metadata,
                is_active, created_at, updated_at
            )
            SELECT
                gen_random_uuid(),
                le.tenant_id,
                'receipt',
                COALESCE(le.voided_at, now()),
                NULL,
                le.amount,
                orig.currency,
                'Reverses receipt for voided payment ' || le.id::text,
                le.customer_id,
                orig.id,
                jsonb_build_object('ledger_entry_id', le.id::text, 'voided', true, 'backfilled', true),
                true,
                now(),
                now()
            FROM ledger_entries le
            JOIN transactions orig
              ON orig.tenant_id = le.tenant_id
             AND orig.external_id = 'khata-receipt:' || le.id::text
            WHERE le.status = 'voided'
              AND NOT EXISTS (
                  SELECT 1 FROM transactions t
                  WHERE t.tenant_id = le.tenant_id AND t.reverses_id = orig.id
              )
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    # Remove backfilled/posted receipt transactions.
    conn.execute(sa.text("DELETE FROM transactions WHERE type = 'receipt'"))
