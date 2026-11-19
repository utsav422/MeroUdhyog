from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from app.core.security import get_password_hash
from app.modules.roles.models import Role
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import (
    UserCreate,
    UserProfileRead,
    UserProfileUpdate,
    UserRead,
)
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError

ALLOWED_AVATAR_MIMES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_AVATAR_BYTES = 2 * 1024 * 1024


def avatar_url_for(user: User) -> str | None:
    if not user.avatar_mime or not user.avatar_updated_at:
        return None
    version = int(user.avatar_updated_at.timestamp() * 1000)
    return f"/users/me/avatar?v={version}"


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

    def _profile_read(self, user: User) -> UserProfileRead:
        return UserProfileRead(
            id=user.id,
            tenant_id=user.tenant_id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            is_superadmin=user.is_superadmin,
            is_email_verified=user.is_email_verified,
            latitude=user.latitude,
            longitude=user.longitude,
            avatar_url=avatar_url_for(user),
            created_at=user.created_at,
        )

    async def get_profile(self, user_id: UUID, tenant_id: UUID) -> UserProfileRead:
        user = await self.get_user(user_id, tenant_id)
        return self._profile_read(user)

    async def update_profile(
        self, user_id: UUID, tenant_id: UUID, data: UserProfileUpdate
    ) -> UserProfileRead:
        user = await self.get_user(user_id, tenant_id)
        updates = data.model_dump(exclude_unset=True)

        if "full_name" in updates:
            if updates["full_name"] is None:
                raise ValidationError("Full name cannot be empty")
            user.full_name = updates["full_name"]

        if "latitude" in updates:
            user.latitude = updates["latitude"]
            user.longitude = updates["longitude"]

        await self.session.flush()
        await self.session.refresh(user)
        return self._profile_read(user)

    async def set_avatar(
        self, user_id: UUID, tenant_id: UUID, mime: str, content: bytes
    ) -> UserProfileRead:
        mime = mime.lower()
        if mime not in ALLOWED_AVATAR_MIMES:
            raise ValidationError("Image must be PNG, JPG, GIF or WebP")
        if not content:
            raise ValidationError("Uploaded file is empty")
        if len(content) > MAX_AVATAR_BYTES:
            raise ValidationError(
                f"Image must be smaller than {MAX_AVATAR_BYTES // 1024 // 1024}MB"
            )

        user = await self.get_user(user_id, tenant_id)
        user.avatar_mime = mime
        user.avatar_data = content
        user.avatar_updated_at = datetime.now(UTC)
        await self.session.flush()
        await self.session.refresh(user)
        return self._profile_read(user)

    async def get_avatar(self, user_id: UUID, tenant_id: UUID) -> tuple[str, bytes]:
        result = await self.session.execute(
            select(User)
            .where(User.id == user_id, User.tenant_id == tenant_id)
            .options(undefer(User.avatar_data))
        )
        user = result.scalar_one_or_none()
        if not user or not user.avatar_mime or not user.avatar_data:
            raise NotFoundError("Avatar not found")
        return user.avatar_mime, user.avatar_data

    async def delete_avatar(self, user_id: UUID, tenant_id: UUID) -> None:
        user = await self.get_user(user_id, tenant_id)
        user.avatar_mime = None
        user.avatar_data = None
        user.avatar_updated_at = None
        await self.session.flush()
