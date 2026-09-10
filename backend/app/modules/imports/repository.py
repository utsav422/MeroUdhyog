from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.imports.models import ImportBatch, ImportRowError
from app.shared.exceptions import NotFoundError


class ImportRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def create_batch(self, filename: str | None, total_rows: int) -> ImportBatch:
        batch = ImportBatch(
            tenant_id=self.tenant_id,
            status="processing",
            filename=filename,
            total_rows=total_rows,
        )
        self.session.add(batch)
        await self.session.flush()
        await self.session.refresh(batch)
        return batch

    async def get_batch(self, batch_id: UUID) -> ImportBatch:
        batch = (
            await self.session.execute(
                select(ImportBatch).where(
                    ImportBatch.id == batch_id, ImportBatch.tenant_id == self.tenant_id
                )
            )
        ).scalar_one_or_none()
        if not batch:
            raise NotFoundError("Import batch not found")
        return batch

    async def list_batches(self, limit: int, offset: int) -> list[ImportBatch]:
        rows = (
            (
                await self.session.execute(
                    select(ImportBatch)
                    .where(ImportBatch.tenant_id == self.tenant_id)
                    .order_by(ImportBatch.created_at.desc())
                    .limit(limit)
                    .offset(offset)
                )
            )
            .scalars()
            .all()
        )
        return list(rows)

    async def set_status(self, batch: ImportBatch, status: str) -> ImportBatch:
        batch.status = status
        await self.session.flush()
        await self.session.refresh(batch)
        return batch

    async def set_counts(
        self, batch: ImportBatch, success: int, errors: int
    ) -> ImportBatch:
        batch.success_count = success
        batch.error_count = errors
        batch.status = "failed" if errors and not success else "completed"
        await self.session.flush()
        await self.session.refresh(batch)
        return batch

    async def add_row_error(
        self, batch_id: UUID, row_number: int, message: str, field: str | None, raw: dict | None
    ) -> ImportRowError:
        error = ImportRowError(
            tenant_id=self.tenant_id,
            batch_id=batch_id,
            row_number=row_number,
            field=field,
            message=message[:500],
            raw_data=raw,
        )
        self.session.add(error)
        await self.session.flush()
        return error

    async def list_row_errors(
        self, batch_id: UUID, limit: int, offset: int
    ) -> list[ImportRowError]:
        rows = (
            (
                await self.session.execute(
                    select(ImportRowError)
                    .where(
                        ImportRowError.batch_id == batch_id,
                        ImportRowError.tenant_id == self.tenant_id,
                    )
                    .order_by(ImportRowError.row_number)
                    .limit(limit)
                    .offset(offset)
                )
            )
            .scalars()
            .all()
        )
        return list(rows)
