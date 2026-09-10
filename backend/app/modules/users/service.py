from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.modules.roles.models import Role
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserCreate, UserRead
from app.shared.exceptions import ConflictError, NotFoundError


class UserService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = UserRepository(session)

    async def _ensure_role_exists(self, tenant_id: UUID, role: str) -> None:
        ok = (
            await self.session.execute(
                select(Role.id).where(Role.tenant_id == tenant_id, Role.code == role)
            )
        ).scalar_one_or_none()
        if not ok:
            raise NotFoundError(f"Role '{role}' is not defined for this tenant")

    async def create_user(self, tenant_id: UUID, data: UserCreate) -> UserRead:
        existing = await self.repo.get_by_email(data.email, tenant_id)
        if existing:
            raise ConflictError("A user with this email already exists")
        await self._ensure_role_exists(tenant_id, data.role)

        user = User(
            tenant_id=tenant_id,
            email=data.email,
            hashed_password=get_password_hash(data.password),
            full_name=data.full_name,
            role=data.role,
        )
        created = await self.repo.create(user)
        return UserRead.model_validate(created)

    async def get_user(self, user_id: UUID, tenant_id: UUID) -> User:
        user = await self.repo.get_by_id(user_id, tenant_id)
        if not user:
            raise NotFoundError("User not found")
        return user

    async def list_users(self, tenant_id: UUID, limit: int, offset: int) -> list[User]:
        return await self.repo.list(tenant_id, limit, offset)
