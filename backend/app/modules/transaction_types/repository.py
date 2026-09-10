from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.transaction_types.models import (
    DEFAULT_TRANSACTION_TYPES,
    TransactionType,
)
from app.shared.exceptions import NotFoundError


class TransactionTypeRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def list(self, limit: int, offset: int) -> list[TransactionType]:
        result = await self.session.execute(
            select(TransactionType)
            .where(TransactionType.tenant_id == self.tenant_id)
            .order_by(TransactionType.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def get(self, type_id: UUID) -> TransactionType:
        result = await self.session.execute(
            select(TransactionType).where(
                TransactionType.id == type_id,
                TransactionType.tenant_id == self.tenant_id,
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            raise NotFoundError("Transaction type not found")
        return row

    async def get_by_code(self, code: str) -> TransactionType | None:
        result = await self.session.execute(
            select(TransactionType).where(
                TransactionType.tenant_id == self.tenant_id,
                TransactionType.code == code,
            )
        )
        return result.scalar_one_or_none()

    async def create(self, type_: TransactionType) -> TransactionType:
        self.session.add(type_)
        await self.session.flush()
        await self.session.refresh(type_)
        return type_

    async def update(self, type_: TransactionType) -> TransactionType:
        await self.session.flush()
        await self.session.refresh(type_)
        return type_

    async def delete(self, type_: TransactionType) -> None:
        await self.session.delete(type_)
        await self.session.flush()


async def seed_default_transaction_types(session: AsyncSession, tenant_id: UUID) -> None:
    """Insert the default ledger types for a tenant if they are not already present."""
    result = await session.execute(
        select(TransactionType).where(
            TransactionType.tenant_id == tenant_id,
            TransactionType.code.in_([code for _, code in DEFAULT_TRANSACTION_TYPES]),
        )
    )
    existing = {row.code for row in result.scalars().all()}
    for name, code in DEFAULT_TRANSACTION_TYPES:
        if code in existing:
            continue
        session.add(
            TransactionType(tenant_id=tenant_id, name=name, code=code)
        )
    await session.flush()