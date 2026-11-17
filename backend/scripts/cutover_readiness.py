"""Report whether the general ledger is ready for report-engine cutover.

The check is read-only. For every tenant it compares the GL with the legacy
transaction-derived statements and fails when any core check differs, when a
transaction is missing from the GL, or when the ledger contains unpostable or
unbalanced entries.

Examples:
    python -m scripts.cutover_readiness
    python -m scripts.cutover_readiness --tenant acme
    python -m scripts.cutover_readiness --date-from 2025-07-01 --date-to 2026-06-30
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from sqlalchemy import select

from app.core import database
from app.core.database import get_session
from app.modules.accounting.service import AccountingService
from app.modules.tenants.models import Tenant


@dataclass
class TenantReadiness:
    tenant_id: UUID
    slug: str
    engine: str = "legacy"
    ready: bool = False
    transactions_total: int = 0
    transactions_posted: int = 0
    transactions_missing: int = 0
    transactions_unpostable: int = 0
    duplicate_active_entries: int = 0
    unbalanced_entries: int = 0
    core_mismatches: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _select_tenants_stmt(tenant_filter: str | None):
    stmt = select(Tenant).order_by(Tenant.created_at)
    if tenant_filter:
        try:
            tenant_id = UUID(tenant_filter)
        except ValueError:
            stmt = stmt.where(Tenant.slug == tenant_filter)
        else:
            stmt = stmt.where(Tenant.id == tenant_id)
    return stmt


async def check_tenant(
    session,
    tenant: Tenant,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> TenantReadiness:
    result = TenantReadiness(tenant_id=tenant.id, slug=tenant.slug)
    service = AccountingService(session, tenant.id)
    try:
        settings = await service.get_settings()
        result.engine = settings.report_engine
        report = await service.reconciliation(date_from=date_from, date_to=date_to)
    except Exception as exc:  # noqa: BLE001 - one tenant must not stop the run
        result.errors.append(str(exc))
        return result

    result.transactions_total = report.transactions_total
    result.transactions_posted = report.transactions_posted
    result.transactions_missing = report.transactions_missing
    result.transactions_unpostable = report.transactions_unpostable
    result.duplicate_active_entries = report.duplicate_active_entries
    result.unbalanced_entries = report.unbalanced_entries
    result.core_mismatches = [
        f"{line.check}: GL {line.gl_amount} vs legacy {line.legacy_amount}"
        for line in report.lines
        if line.status == "difference"
    ]
    result.ready = not (
        result.transactions_missing
        or result.transactions_unpostable
        or result.duplicate_active_entries
        or result.unbalanced_entries
        or result.core_mismatches
        or result.errors
    )
    return result


async def run(args: argparse.Namespace) -> int:
    async with get_session() as session:
        if database.engine is not None:
            database.engine.sync_engine.echo = False
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.engine.Engine").setLevel(logging.WARNING)
        tenants = list(
            (await session.execute(_select_tenants_stmt(args.tenant))).scalars().all()
        )
        if not tenants:
            print("No tenants matched the filter.")
            return 1

        results: list[TenantReadiness] = []
        for tenant in tenants:
            result = await check_tenant(
                session,
                tenant,
                date_from=args.date_from,
                date_to=args.date_to,
            )
            results.append(result)
            print(
                f"[{result.slug}] engine={result.engine} ready={'yes' if result.ready else 'no'} "
                f"transactions={result.transactions_total} posted={result.transactions_posted} "
                f"missing={result.transactions_missing} "
                f"unpostable={result.transactions_unpostable} "
                f"duplicates={result.duplicate_active_entries} "
                f"unbalanced={result.unbalanced_entries}"
            )
            for mismatch in result.core_mismatches:
                print(f"  ! {mismatch}", file=sys.stderr)
            for error in result.errors:
                print(f"  ! {error}", file=sys.stderr)

    ready = sum(1 for result in results if result.ready)
    print(
        "TOTAL "
        f"tenants={len(results)} ready={ready} not_ready={len(results) - ready} "
        f"missing={sum(r.transactions_missing for r in results)} "
        f"unpostable={sum(r.transactions_unpostable for r in results)} "
        f"duplicates={sum(r.duplicate_active_entries for r in results)} "
        f"unbalanced={sum(r.unbalanced_entries for r in results)} "
        f"mismatches={sum(len(r.core_mismatches) for r in results)} "
        f"errors={sum(len(r.errors) for r in results)}"
    )
    return 0 if ready == len(results) else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Check whether the GL is ready for report-engine cutover."
    )
    parser.add_argument(
        "--tenant", help="Tenant slug or UUID. Defaults to every tenant."
    )
    parser.add_argument("--date-from", type=date.fromisoformat, default=None)
    parser.add_argument("--date-to", type=date.fromisoformat, default=None)
    return parser


def main() -> int:
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
