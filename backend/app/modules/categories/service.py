from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.categories.models import Category, generate_slug
from app.modules.categories.repository import CategoryRepository
from app.modules.categories.schemas import CategoryCreate, CategoryRead, CategoryUpdate
from app.shared.exceptions import ConflictError


class CategoryService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = CategoryRepository(session, tenant_id)

    async def list(self, limit: int, offset: int) -> list[CategoryRead]:
        cats = await self.repo.list(limit, offset)
        return [CategoryRead.model_validate(c) for c in cats]

    async def get(self, category_id: UUID) -> CategoryRead:
        cat = await self.repo.get(category_id)
        return CategoryRead.model_validate(cat)

    async def create(self, data: CategoryCreate) -> CategoryRead:
        slug = generate_slug(data.name)
        existing = await self.repo.get_by_slug(slug)
        if existing:
            raise ConflictError("A category with this name already exists")
        cat = Category(
            tenant_id=self.tenant_id,
            name=data.name,
            slug=slug,
            description=data.description,
        )
        created = await self.repo.create(cat)
        return CategoryRead.model_validate(created)

    async def update(self, category_id: UUID, data: CategoryUpdate) -> CategoryRead:
        cat = await self.repo.get(category_id)
        updates = data.model_dump(exclude_unset=True)
        if "name" in updates:
            new_slug = generate_slug(updates["name"])
            existing = await self.repo.get_by_slug(new_slug)
            if existing and existing.id != category_id:
                raise ConflictError("A category with this name already exists")
            cat.slug = new_slug
        for field, value in updates.items():
            setattr(cat, field, value)
        updated = await self.repo.update(cat)
        return CategoryRead.model_validate(updated)

    async def delete(self, category_id: UUID) -> None:
        cat = await self.repo.get(category_id)
        await self.repo.delete(cat)
