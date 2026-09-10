from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audits.models import AuditFinding, AuditRun
from app.modules.audits.repository import AuditRepository
from app.modules.audits.rules import LedgerEntry, run_rules
from app.modules.audits.schemas import AuditFindingRead, AuditRunRead
from app.modules.transactions.models import Transaction


def _parse_scope(scope_month: str | None) -> tuple[date, date] | None:
    if not scope_month:
        return None
    year, month = (int(part) for part in scope_month.split("-"))
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


class AuditService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = AuditRepository(session, tenant_id)

    async def _ledger(self, scope: tuple[date, date] | None) -> list[LedgerEntry]:
        stmt = select(
            Transaction.id,
            Transaction.type,
            Transaction.amount,
            Transaction.tax_amount,
            Transaction.discount_amount,
            Transaction.transaction_date,
            Transaction.currency,
            Transaction.reverses_id,
            Transaction.external_id,
        ).where(
            Transaction.tenant_id == self.tenant_id,
            Transaction.is_active.is_(True),
        )
        if scope:
            stmt = stmt.where(Transaction.transaction_date >= scope[0])
            stmt = stmt.where(Transaction.transaction_date < scope[1])
        rows = (await self.session.execute(stmt)).all()
        return [
            LedgerEntry(
                id=row.id,
                type=row.type,
                amount=row.amount,
                tax_amount=row.tax_amount,
                discount_amount=row.discount_amount,
                transaction_date=row.transaction_date,
                currency=row.currency,
                reverses_id=row.reverses_id,
                external_id=row.external_id,
            )
            for row in rows
        ]

    async def trigger(self, scope_month: str | None, triggered_by: UUID | None) -> AuditRunRead:
        scope = _parse_scope(scope_month)
        run = AuditRun(
            tenant_id=self.tenant_id,
            status="pending",
            scope_month=scope_month,
            triggered_by=triggered_by,
        )
        await self.repo.create_run(run)

        try:
            entries = await self._ledger(scope)
            spec_list = run_rules(entries)
            findings = [
                AuditFinding(
                    tenant_id=self.tenant_id,
                    run_id=run.id,
                    rule_code=spec.rule_code,
                    severity=spec.severity,
                    transaction_id=spec.transaction_id,
                    message=spec.message,
                    evidence=spec.evidence,
                )
                for spec in spec_list
            ]
            await self.repo.create_findings(findings)
            run.total_findings = len(findings)
            run.status = "completed"
            run.completed_at = datetime.now(UTC)
            await self.session.flush()
            await self.session.refresh(run)
        except Exception:
            run.status = "failed"
            run.completed_at = datetime.now(UTC)
            await self.session.flush()
            await self.session.refresh(run)
            raise

        return AuditRunRead.model_validate(run)

    async def list_runs(self, limit: int, offset: int) -> list[AuditRunRead]:
        runs = await self.repo.list_runs(limit, offset)
        return [AuditRunRead.model_validate(r) for r in runs]

    async def get_run(self, run_id: UUID) -> AuditRunRead:
        run = await self.repo.get_run(run_id)
        return AuditRunRead.model_validate(run)

    async def list_findings(
        self,
        limit: int,
        offset: int,
        run_id: UUID | None = None,
        severity: str | None = None,
        resolved: bool | None = None,
    ) -> list[AuditFindingRead]:
        findings = await self.repo.list_findings(
            limit=limit,
            offset=offset,
            run_id=run_id,
            severity=severity,
            resolved=resolved,
        )
        return [AuditFindingRead.model_validate(f) for f in findings]

    async def count_findings(
        self,
        run_id: UUID | None = None,
        severity: str | None = None,
        resolved: bool | None = None,
    ) -> int:
        return await self.repo.count_findings(run_id=run_id, severity=severity, resolved=resolved)

    async def get_finding(self, finding_id: UUID) -> AuditFindingRead:
        finding = await self.repo.get_finding(finding_id)
        return AuditFindingRead.model_validate(finding)

    async def resolve(self, finding_id: UUID, note: str | None, resolved: bool) -> AuditFindingRead:
        finding = await self.repo.get_finding(finding_id)
        finding.is_resolved = resolved
        finding.resolution_note = note
        updated = await self.repo.update_finding(finding)
        return AuditFindingRead.model_validate(updated)
