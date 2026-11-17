"""Backfill the general ledger from historical transactions.

The script is idempotent: an existing active journal entry for a source
transaction is left untouched. Opening balances are posted once per tenant and
the unbalanced part is parked in Opening Balance Equity (3090).

Examples:
    python -m scripts.backfill_ledger --dry-run
    python -m scripts.backfill_ledger
    python -m scripts.backfill_ledger --tenant acme
    python -m scripts.backfill_ledger --repost-openings
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select

from app.core import database
from app.core.database import get_session
from app.modules.accounting.coa import seed_default_accounts
from app.modules.accounting.models import AccountingSettings
from app.modules.accounting.posting import PostingService
from app.modules.accounting.repository import AccountingRepository
from app.modules.tenants.models import Tenant
from app.modules.transactions.models import Transaction

POSTABLE_TYPES = {"sale", "purchase", "expense", "receipt"}
CENT = Decimal("0.01")


def _q(value: Decimal | int | str | None) -> Decimal:
    return Decimal(value or 0).quantize(CENT)


def _is_postable(tx: Transaction) -> bool:
    if tx.type not in POSTABLE_TYPES:
        return False
    amount = _q(tx.amount)
    if amount <= 0:
        return False
    if tx.type in {"sale", "purchase", "expense"}:
        return _q(tx.tax_amount or 0) <= amount
    return True


def _has_openings(settings: AccountingSettings) -> bool:
    values = (
        settings.opening_cash,
        settings.opening_receivables,
        settings.opening_inventory,
        settings.opening_other_assets,
        settings.opening_payables,
        settings.opening_loans,
        settings.opening_capital,
    )
    return any(_q(value) > 0 for value in values)


@dataclass
class TenantResult:
    tenant_id: UUID
    slug: str
    opening: str = "none"
    posted: int = 0
    existing: int = 0
    unpostable: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)


async def backfill_tenant(
    session,
    tenant: Tenant,
    *,
    dry_run: bool = False,
    skip_openings: bool = False,
    repost_openings: bool = False,
) -> TenantResult:
    result = TenantResult(tenant_id=tenant.id, slug=tenant.slug)
    repo = AccountingRepository(session, tenant.id)

    if dry_run:
        settings = await repo.get_settings()
    else:
        await seed_default_accounts(session, tenant.id)
        settings = await repo.ensure_settings()

    posting = PostingService(session, tenant.id)

    if settings is not None and not skip_openings and _has_openings(settings):
        existing = await posting.active_entry_for_source(
            "opening_balance", settings.id
        )
        if existing is not None and not repost_openings:
            result.opening = "existing"
        elif dry_run:
            result.opening = "would-repost" if existing else "would-post"
        else:
            earliest = (
                await session.execute(
                    select(Transaction.transaction_date)
                    .where(Transaction.tenant_id == tenant.id)
                    .order_by(Transaction.transaction_date)
                    .limit(1)
                )
            ).scalar_one_or_none()
            entry_date = (
                settings.book_start_date
                or (earliest.date() if earliest else date.today())
            )
            entry = await posting.post_opening_balances(
                settings, entry_date=entry_date, repost=repost_openings
            )
            result.opening = "posted" if entry is not None else "skipped"
    elif skip_openings:
        result.opening = "skipped"

    transactions = (
        (
            await session.execute(
                select(Transaction)
                .where(Transaction.tenant_id == tenant.id)
                .order_by(
                    Transaction.transaction_date, Transaction.created_at
                )
            )
        )
        .scalars()
        .all()
    )

    for tx in transactions:
        if not _is_postable(tx):
            result.unpostable += 1
            continue

        existing = await posting.active_entry_for(tx.id)
        if existing is not None:
            result.existing += 1
            continue

        if dry_run:
            result.posted += 1
            continue

        try:
            async with session.begin_nested():
                entry = await posting.post_transaction(tx)
        except Exception as exc:  # noqa: BLE001 - report and keep going
            result.failed += 1
            result.errors.append(f"{tx.id}: {exc}")
            continue

        if entry is None:
            result.unpostable += 1
        else:
            result.posted += 1

    return result


async def _select_tenants(session, tenant_filter: str | None) -> list[Tenant]:
    stmt = select(Tenant).order_by(Tenant.created_at)
    if tenant_filter:
        try:
            tenant_id = UUID(tenant_filter)
        except ValueError:
            stmt = stmt.where(Tenant.slug == tenant_filter)
        else:
            stmt = stmt.where(Tenant.id == tenant_id)
    return list((await session.execute(stmt)).scalars().all())


async def run(args: argparse.Namespace) -> int:
    async with get_session() as session:
        if database.engine is not None:
            database.engine.sync_engine.echo = False
        # The app engine honours DEBUG with SQL echo; keep CLI output readable.
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.engine.Engine").setLevel(logging.WARNING)
        tenants = await _select_tenants(session, args.tenant)
        if not tenants:
            print("No tenants matched the filter.")
            return 1

        results: list[TenantResult] = []
        for tenant in tenants:
            try:
                result = await backfill_tenant(
                    session,
                    tenant,
                    dry_run=args.dry_run,
                    skip_openings=args.skip_openings,
                    repost_openings=args.repost_openings,
                )
            except Exception as exc:  # noqa: BLE001 - one tenant must not stop the run
                await session.rollback()
                result = TenantResult(
                    tenant_id=tenant.id,
                    slug=tenant.slug,
                    failed=1,
                    errors=[str(exc)],
                )
            else:
                if not args.dry_run:
                    await session.commit()
            results.append(result)

            print(
                f"[{result.slug}] openings={result.opening} "
                f"posted={result.posted} existing={result.existing} "
                f"unpostable={result.unpostable} failed={result.failed}"
            )
            for error in result.errors:
                print(f"  ! {error}", file=sys.stderr)

    openings = sum(
        1
        for r in results
        if r.opening in {"posted", "would-post", "would-repost"}
    )
    print(
        "TOTAL "
        f"tenants={len(results)} "
        f"opening_posted={openings} "
        f"posted={sum(r.posted for r in results)} "
        f"existing={sum(r.existing for r in results)} "
        f"unpostable={sum(r.unpostable for r in results)} "
        f"failed={sum(r.failed for r in results)}"
    )
    return 0 if all(r.failed == 0 for r in results) else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Post historical transactions and opening balances to the GL."
    )
    parser.add_argument(
        "--tenant",
        help="Tenant slug or UUID. Defaults to every tenant.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be posted without writing anything.",
    )
    parser.add_argument(
        "--skip-openings",
        action="store_true",
        help="Do not post opening balances.",
    )
    parser.add_argument(
        "--repost-openings",
        action="store_true",
        help="Void and recreate the opening balance entry if it exists.",
    )
    return parser


def main() -> int:
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
