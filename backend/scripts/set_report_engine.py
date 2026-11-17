"""Controlled switch of a tenant's accounting report engine.

The default is a dry run. Use ``--apply`` to persist the change. When switching
to ``gl`` the script first runs the same readiness checks as
``scripts.cutover_readiness`` and refuses to switch any tenant that is not
ready unless ``--force`` is supplied.

Examples:
    python -m scripts.set_report_engine --engine gl
    python -m scripts.set_report_engine --engine gl --tenant acme --apply
    python -m scripts.set_report_engine --engine legacy --apply
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from sqlalchemy import select

from app.core import database
from app.core.database import get_session
from app.modules.accounting import schemas
from app.modules.accounting.service import AccountingService
from app.modules.tenants.models import Tenant
from scripts.cutover_readiness import check_tenant


@dataclass
class SwitchResult:
    slug: str
    current: str
    target: str
    status: str
    detail: str = ""
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


async def run(args: argparse.Namespace) -> int:
    async with get_session() as session:
        if database.engine is not None:
            database.engine.sync_engine.echo = False
        logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
        tenants = list(
            (await session.execute(_select_tenants_stmt(args.tenant))).scalars().all()
        )
        if not tenants:
            print("No tenants matched the filter.")
            return 1

        results: list[SwitchResult] = []
        for tenant in tenants:
            service = AccountingService(session, tenant.id)
            try:
                settings = await service.get_settings()
            except Exception as exc:  # noqa: BLE001 - one tenant must not stop the run
                results.append(
                    SwitchResult(
                        slug=tenant.slug,
                        current="?",
                        target=args.engine,
                        status="failed",
                        errors=[str(exc)],
                    )
                )
                continue

            result = SwitchResult(
                slug=tenant.slug,
                current=settings.report_engine,
                target=args.engine,
                status="unchanged",
            )
            if settings.report_engine == args.engine:
                results.append(result)
                continue

            if args.engine == "gl" and not args.force:
                readiness = await check_tenant(
                    session,
                    tenant,
                    date_from=args.date_from,
                    date_to=args.date_to,
                )
                if not readiness.ready:
                    result.status = "blocked"
                    result.detail = "readiness checks failed"
                    result.errors.extend(readiness.core_mismatches)
                    result.errors.extend(readiness.errors)
                    results.append(result)
                    continue

            if not args.apply:
                result.status = "would-switch"
                results.append(result)
                continue

            try:
                await service.update_settings(
                    schemas.AccountingSettingsUpdate(report_engine=args.engine)
                )
                await session.commit()
            except Exception as exc:  # noqa: BLE001 - report and keep going
                await session.rollback()
                result.status = "failed"
                result.errors.append(str(exc))
            else:
                result.status = "switched"
            results.append(result)

        for result in results:
            print(
                f"[{result.slug}] {result.current} -> {result.target} "
                f"{result.status}{f' ({result.detail})' if result.detail else ''}"
            )
            for error in result.errors:
                print(f"  ! {error}")

    switched = sum(1 for result in results if result.status == "switched")
    would = sum(1 for result in results if result.status == "would-switch")
    unchanged = sum(1 for result in results if result.status == "unchanged")
    blocked = sum(1 for result in results if result.status == "blocked")
    failed = sum(1 for result in results if result.status == "failed")
    print(
        "TOTAL "
        f"tenants={len(results)} switched={switched} would_switch={would} "
        f"unchanged={unchanged} blocked={blocked} failed={failed} "
        f"apply={'yes' if args.apply else 'no'}"
    )
    return 0 if blocked == 0 and failed == 0 else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Switch tenants between the legacy and GL report engines."
    )
    parser.add_argument("--engine", choices=["legacy", "gl"], required=True)
    parser.add_argument(
        "--tenant", help="Tenant slug or UUID. Defaults to every tenant."
    )
    parser.add_argument("--date-from", type=date.fromisoformat, default=None)
    parser.add_argument("--date-to", type=date.fromisoformat, default=None)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist the change. Without this flag the script is a dry run.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Switch to GL even when readiness checks fail.",
    )
    return parser


def main() -> int:
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
