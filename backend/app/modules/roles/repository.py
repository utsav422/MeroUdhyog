from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.roles.models import Role
from app.shared.exceptions import NotFoundError


class RoleRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def list(self, limit: int, offset: int) -> list[Role]:
        result = await self.session.execute(
            select(Role)
            .where(Role.tenant_id == self.tenant_id)
            .order_by(Role.is_system.desc(), Role.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def get(self, role_id: UUID) -> Role:
        result = await self.session.execute(
            select(Role).where(
                Role.id == role_id, Role.tenant_id == self.tenant_id
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            raise NotFoundError("Role not found")
        return row

    async def get_by_code(self, code: str) -> Role | None:
        result = await self.session.execute(
            select(Role).where(
                Role.tenant_id == self.tenant_id, Role.code == code
            )
        )
        return result.scalar_one_or_none()

    async def create(self, role: Role) -> Role:
        self.session.add(role)
        await self.session.flush()
        await self.session.refresh(role)
        return role

    async def update(self, role: Role) -> Role:
        await self.session.flush()
        await self.session.refresh(role)
        return role

    async def delete(self, role: Role) -> None:
        await self.session.delete(role)
        await self.session.flush()
