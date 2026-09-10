from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.categories.models import Category
from app.shared.exceptions import NotFoundError


class CategoryRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def list(self, limit: int, offset: int) -> list[Category]:
        result = await self.session.execute(
            select(Category)
            .where(Category.tenant_id == self.tenant_id)
            .order_by(Category.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def get(self, category_id: UUID) -> Category:
        result = await self.session.execute(
            select(Category).where(
                Category.id == category_id,
                Category.tenant_id == self.tenant_id,
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            raise NotFoundError("Category not found")
        return row

    async def get_by_slug(self, slug: str) -> Category | None:
        result = await self.session.execute(
            select(Category).where(
                Category.tenant_id == self.tenant_id,
                Category.slug == slug,
            )
        )
        return result.scalar_one_or_none()

    async def create(self, category: Category) -> Category:
        self.session.add(category)
        await self.session.flush()
        await self.session.refresh(category)
        return category

    async def update(self, category: Category) -> Category:
        await self.session.flush()
        await self.session.refresh(category)
        return category

    async def delete(self, category: Category) -> None:
        await self.session.delete(category)
        await self.session.flush()
