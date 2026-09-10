from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audits.models import AuditFinding, AuditRun
from app.shared.exceptions import NotFoundError


class AuditRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def list_runs(self, limit: int, offset: int) -> list[AuditRun]:
        result = await self.session.execute(
            select(AuditRun)
            .where(AuditRun.tenant_id == self.tenant_id)
            .order_by(AuditRun.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def get_run(self, run_id: UUID) -> AuditRun:
        run = (
            await self.session.execute(
                select(AuditRun).where(AuditRun.id == run_id, AuditRun.tenant_id == self.tenant_id)
            )
        ).scalar_one_or_none()
        if not run:
            raise NotFoundError("Audit run not found")
        return run

    async def create_run(self, run: AuditRun) -> AuditRun:
        self.session.add(run)
        await self.session.flush()
        await self.session.refresh(run)
        return run

    async def list_findings(
        self,
        limit: int,
        offset: int,
        run_id: UUID | None = None,
        severity: str | None = None,
        resolved: bool | None = None,
    ) -> list[AuditFinding]:
        stmt = select(AuditFinding).where(AuditFinding.tenant_id == self.tenant_id)
        if run_id:
            stmt = stmt.where(AuditFinding.run_id == run_id)
        if severity:
            stmt = stmt.where(AuditFinding.severity == severity)
        if resolved is not None:
            stmt = stmt.where(AuditFinding.is_resolved.is_(resolved))
        result = await self.session.execute(
            stmt.order_by(AuditFinding.created_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def count_findings(
        self,
        run_id: UUID | None = None,
        severity: str | None = None,
        resolved: bool | None = None,
    ) -> int:
        stmt = select(func.count(AuditFinding.id)).where(AuditFinding.tenant_id == self.tenant_id)
        if run_id:
            stmt = stmt.where(AuditFinding.run_id == run_id)
        if severity:
            stmt = stmt.where(AuditFinding.severity == severity)
        if resolved is not None:
            stmt = stmt.where(AuditFinding.is_resolved.is_(resolved))
        return int((await self.session.execute(stmt)).scalar_one())

    async def get_finding(self, finding_id: UUID) -> AuditFinding:
        finding = (
            await self.session.execute(
                select(AuditFinding).where(
                    AuditFinding.id == finding_id,
                    AuditFinding.tenant_id == self.tenant_id,
                )
            )
        ).scalar_one_or_none()
        if not finding:
            raise NotFoundError("Audit finding not found")
        return finding

    async def create_findings(self, findings: list[AuditFinding]) -> None:
        if findings:
            self.session.add_all(findings)
            await self.session.flush()

    async def update_finding(self, finding: AuditFinding) -> AuditFinding:
        await self.session.flush()
        await self.session.refresh(finding)
        return finding
