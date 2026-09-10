from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: UUID, tenant_id: UUID) -> User | None:
        result = await self.session.execute(
            select(User).where(User.id == user_id, User.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str, tenant_id: UUID) -> User | None:
        result = await self.session.execute(
            select(User).where(User.email == email, User.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list(self, tenant_id: UUID, limit: int, offset: int) -> list[User]:
        result = await self.session.execute(
            select(User)
            .where(User.tenant_id == tenant_id)
            .order_by(User.created_at)
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def count(self, tenant_id: UUID) -> int:
        result = await self.session.execute(
            select(User.id).where(User.tenant_id == tenant_id)
        )
        return len(result.scalars().all())

    async def create(self, user: User) -> User:
        self.session.add(user)
        await self.session.flush()
        await self.session.refresh(user)
        return user