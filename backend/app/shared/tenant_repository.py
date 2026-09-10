from typing import Generic, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


class TenantScopedRepository(Generic[T]):
    def __init__(self, model: type[T], session: AsyncSession, tenant_id: UUID):
        self.model = model
        self.session = session
        self.tenant_id = tenant_id

    async def get_by_id(self, id: UUID) -> T | None:
        result = await self.session.execute(
            select(self.model).where(
                self.model.id == id, self.model.tenant_id == self.tenant_id
            )
        )
        return result.scalar_one_or_none()

    async def get_all(self, limit: int = 100, offset: int = 0) -> list[T]:
        result = await self.session.execute(
            select(self.model)
            .where(self.model.tenant_id == self.tenant_id)
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def create(self, obj: T) -> T:
        obj.tenant_id = self.tenant_id
        self.session.add(obj)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def update(self, obj: T) -> T:
        if obj.tenant_id != self.tenant_id:
            raise ValueError("Cannot update object from different tenant")
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def delete(self, obj: T) -> None:
        if obj.tenant_id != self.tenant_id:
            raise ValueError("Cannot delete object from different tenant")
        await self.session.delete(obj)
        await self.session.flush()

    async def exists(self, id: UUID) -> bool:
        result = await self.session.execute(
            select(self.model.id).where(
                self.model.id == id, self.model.tenant_id == self.tenant_id
            )
        )
        return result.scalar_one_or_none() is not None