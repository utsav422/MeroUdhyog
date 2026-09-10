from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    hash_refresh_token,
    verify_password,
)
from app.modules.auth.models import RefreshToken
from app.modules.auth.schemas import LoginRequest, RegisterRequest
from app.modules.roles.seed import seed_default_roles
from app.modules.tenants.repository import TenantRepository
from app.modules.transaction_types.repository import seed_default_transaction_types
from app.modules.users.models import User
from app.shared.exceptions import ConflictError, UnauthorizedError

settings = get_settings()


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.tenant_repo = TenantRepository(session)

    async def register(self, data: RegisterRequest) -> dict:
        existing_tenant = await self.tenant_repo.get_by_slug(data.tenant_slug)
        if existing_tenant:
            raise ConflictError("Tenant slug already in use")

        # Only the very first account to ever register becomes the single
        # platform superadmin (can do everything across all tenants).
        is_superadmin = not await self._superadmin_exists()

        tenant = await self.tenant_repo.create(data.tenant_name, data.tenant_slug)

        user = User(
            tenant_id=tenant.id,
            email=data.email,
            hashed_password=get_password_hash(data.password),
            full_name=data.full_name,
            role="owner",
            is_superadmin=is_superadmin,
        )
        self.session.add(user)
        await self.session.flush()

        await seed_default_transaction_types(self.session, tenant.id)
        await seed_default_roles(self.session, tenant.id)

        return await self._issue_tokens(user.id, tenant.id)

    async def _superadmin_exists(self) -> bool:
        row = await self.session.execute(
            select(User.id).where(User.is_superadmin.is_(True)).limit(1)
        )
        return row.scalar_one_or_none() is not None

    async def login(self, data: LoginRequest) -> dict:
        user_row = await self.session.execute(
            select(User).where(User.email == data.email)
        )
        user = user_row.scalar_one_or_none()
        if not user or not verify_password(data.password, user.hashed_password):
            raise UnauthorizedError("Invalid email or password")

        if not user.is_active:
            raise UnauthorizedError("User account is disabled")

        return await self._issue_tokens(user.id, user.tenant_id)

    async def _issue_tokens(self, user_id: UUID, tenant_id: UUID) -> dict:
        access_token = create_access_token(user_id, tenant_id)
        refresh_token = create_refresh_token(user_id, tenant_id)

        await self._store_refresh_token(
            user_id=user_id,
            tenant_id=tenant_id,
            token=refresh_token,
            expires_at=datetime.now(UTC)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user_id": str(user_id),
            "tenant_id": str(tenant_id),
        }

    async def refresh(self, token: str) -> dict:
        token_hash = hash_refresh_token(token)
        row = await self.session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        rt = row.scalar_one_or_none()
        if (
            not rt
            or rt.revoked_at is not None
            or rt.expires_at < datetime.now(UTC)
        ):
            raise UnauthorizedError("Invalid refresh token")

        rt.revoked_at = datetime.now(UTC)

        user_row = await self.session.execute(
            select(User).where(User.id == rt.user_id)
        )
        user = user_row.scalar_one_or_none()
        if not user or not user.is_active:
            raise UnauthorizedError("User account is disabled")

        return await self._issue_tokens(user.id, user.tenant_id)

    async def logout(self, token: str) -> None:
        token_hash = hash_refresh_token(token)
        row = await self.session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        rt = row.scalar_one_or_none()
        if rt and rt.revoked_at is None:
            rt.revoked_at = datetime.now(UTC)
            await self.session.flush()

    async def _store_refresh_token(
        self, user_id: UUID, tenant_id: UUID, token: str, expires_at: datetime
    ) -> None:
        rt = RefreshToken(
            tenant_id=tenant_id,
            user_id=user_id,
            token_hash=hash_refresh_token(token),
            expires_at=expires_at,
        )
        self.session.add(rt)
        await self.session.flush()
