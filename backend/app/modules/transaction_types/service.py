from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.transaction_types.models import TransactionType
from app.modules.transaction_types.repository import TransactionTypeRepository
from app.modules.transaction_types.schemas import (
    TransactionTypeCreate,
    TransactionTypeRead,
    TransactionTypeUpdate,
)
from app.shared.exceptions import ConflictError


class TransactionTypeService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = TransactionTypeRepository(session, tenant_id)

    async def list(self, limit: int, offset: int) -> list[TransactionTypeRead]:
        items = await self.repo.list(limit, offset)
        return [TransactionTypeRead.model_validate(item) for item in items]

    async def get(self, type_id: UUID) -> TransactionTypeRead:
        item = await self.repo.get(type_id)
        return TransactionTypeRead.model_validate(item)

    async def create(self, data: TransactionTypeCreate) -> TransactionTypeRead:
        existing = await self.repo.get_by_code(data.code)
        if existing:
            raise ConflictError("A transaction type with this code already exists")
        item = TransactionType(
            tenant_id=self.tenant_id,
            name=data.name,
            code=data.code,
        )
        created = await self.repo.create(item)
        return TransactionTypeRead.model_validate(created)

    async def update(
        self, type_id: UUID, data: TransactionTypeUpdate
    ) -> TransactionTypeRead:
        item = await self.repo.get(type_id)
        updates = data.model_dump(exclude_unset=True)
        if "code" in updates and updates["code"] != item.code:
            existing = await self.repo.get_by_code(updates["code"])
            if existing and existing.id != type_id:
                raise ConflictError("A transaction type with this code already exists")
        for field, value in updates.items():
            setattr(item, field, value)
        updated = await self.repo.update(item)
        return TransactionTypeRead.model_validate(updated)

    async def delete(self, type_id: UUID) -> None:
        item = await self.repo.get(type_id)
        await self.repo.delete(item)