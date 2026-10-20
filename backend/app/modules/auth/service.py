from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.email import send_email
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_email_token,
    get_password_hash,
    hash_email_token,
    hash_refresh_token,
    verify_password,
)
from app.modules.auth.models import EmailToken, RefreshToken
from app.modules.auth.schemas import LoginRequest, RegisterRequest
from app.modules.roles.seed import seed_default_roles
from app.modules.tenants.repository import TenantRepository
from app.modules.transaction_types.repository import seed_default_transaction_types
from app.modules.users.models import User
from app.shared.exceptions import ConflictError, UnauthorizedError, ValidationError

settings = get_settings()

PURPOSE_RESET = "password_reset"
PURPOSE_VERIFY = "email_verify"


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

        # Welcome + verification email (console mailer in dev).
        await self._send_verification_email(user)

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

        if settings.REQUIRE_EMAIL_VERIFICATION and not user.is_email_verified:
            raise UnauthorizedError(
                "Email not verified. Check your inbox for the verification link."
            )

        user.last_login_at = datetime.now(UTC)
        await self.session.flush()

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

    # ------------------------------------------------------------------
    # Email-token flows: password reset + email verification
    # ------------------------------------------------------------------

    async def _get_user_by_email(self, email: str) -> User | None:
        row = await self.session.execute(
            select(User).where(User.email == email).order_by(User.created_at)
        )
        return row.scalars().first()

    async def _get_user_by_id(self, user_id: UUID) -> User | None:
        row = await self.session.execute(select(User).where(User.id == user_id))
        return row.scalar_one_or_none()

    async def _issue_email_token(
        self, user: User, purpose: str, ttl: timedelta
    ) -> str:
        """Revoke any outstanding tokens of the same purpose, then issue one."""
        now = datetime.now(UTC)
        old_rows = await self.session.execute(
            select(EmailToken).where(
                EmailToken.user_id == user.id,
                EmailToken.purpose == purpose,
                EmailToken.used_at.is_(None),
                EmailToken.revoked_at.is_(None),
            )
        )
        for old in old_rows.scalars().all():
            old.revoked_at = now

        raw = generate_email_token()
        self.session.add(
            EmailToken(
                tenant_id=user.tenant_id,
                user_id=user.id,
                purpose=purpose,
                token_hash=hash_email_token(raw),
                expires_at=now + ttl,
            )
        )
        await self.session.flush()
        return raw

    async def _consume_email_token(self, raw: str, purpose: str) -> User:
        token_hash = hash_email_token(raw)
        row = await self.session.execute(
            select(EmailToken).where(
                EmailToken.token_hash == token_hash,
                EmailToken.purpose == purpose,
            )
        )
        token = row.scalar_one_or_none()
        if (
            not token
            or token.used_at is not None
            or token.revoked_at is not None
            or token.expires_at < datetime.now(UTC)
        ):
            raise ValidationError("This link is invalid or has expired")

        user = await self._get_user_by_id(token.user_id)
        if not user or not user.is_active:
            raise ValidationError("This link is invalid or has expired")

        token.used_at = datetime.now(UTC)
        await self.session.flush()
        return user

    async def _send_verification_email(self, user: User) -> None:
        raw = await self._issue_email_token(
            user, PURPOSE_VERIFY, timedelta(hours=settings.VERIFY_TOKEN_EXPIRE_HOURS)
        )
        link = f"{settings.FRONTEND_URL}/verify-email?token={raw}"
        send_email(
            to=user.email,
            subject="Verify your Mero Udhyog email",
            text=(
                f"Namaste {user.full_name},\n\n"
                "Welcome to Mero Udhyog! Please confirm your email address by "
                f"opening the link below:\n\n{link}\n\n"
                f"This link expires in {settings.VERIFY_TOKEN_EXPIRE_HOURS} hours.\n\n"
                "If you didn't create this account you can ignore this email."
            ),
        )

    async def forgot_password(self, email: str) -> None:
        """Always returns success to avoid leaking which emails are registered."""
        user = await self._get_user_by_email(email)
        if not user or not user.is_active:
            return

        raw = await self._issue_email_token(
            user, PURPOSE_RESET, timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
        )
        link = f"{settings.FRONTEND_URL}/reset-password?token={raw}"
        send_email(
            to=user.email,
            subject="Reset your Mero Udhyog password",
            text=(
                f"Namaste {user.full_name},\n\n"
                "We received a request to reset your Mero Udhyog password. Open "
                f"the link below to choose a new one:\n\n{link}\n\n"
                f"This link expires in {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes. "
                "If you didn't request this, you can safely ignore this email."
            ),
        )

    async def reset_password(self, raw_token: str, new_password: str) -> None:
        user = await self._consume_email_token(raw_token, PURPOSE_RESET)
        user.hashed_password = get_password_hash(new_password)
        await self._revoke_all_refresh_tokens(user.id)
        await self.session.flush()

    async def change_password(
        self, user_id: UUID, current_password: str, new_password: str
    ) -> None:
        user = await self._get_user_by_id(user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("User account is disabled")
        if not verify_password(current_password, user.hashed_password):
            raise ValidationError("Current password is incorrect")

        user.hashed_password = get_password_hash(new_password)
        await self._revoke_all_refresh_tokens(user.id)
        await self.session.flush()

    async def verify_email(self, raw_token: str) -> User:
        user = await self._consume_email_token(raw_token, PURPOSE_VERIFY)
        user.is_email_verified = True
        await self.session.flush()
        return user

    async def resend_verification(self, email: str) -> None:
        user = await self._get_user_by_email(email)
        if not user or not user.is_active or user.is_email_verified:
            return
        await self._send_verification_email(user)

    async def email_token_info(self, raw_token: str, purpose: str) -> str | None:
        """Return the email a token belongs to, or None if it isn't usable."""
        token_hash = hash_email_token(raw_token)
        row = await self.session.execute(
            select(EmailToken).where(
                EmailToken.token_hash == token_hash,
                EmailToken.purpose == purpose,
            )
        )
        token = row.scalar_one_or_none()
        if (
            not token
            or token.used_at is not None
            or token.revoked_at is not None
            or token.expires_at < datetime.now(UTC)
        ):
            return None
        user = await self._get_user_by_id(token.user_id)
        return user.email if user else None

    async def _revoke_all_refresh_tokens(self, user_id: UUID) -> None:
        now = datetime.now(UTC)
        rows = await self.session.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
            )
        )
        for rt in rows.scalars().all():
            rt.revoked_at = now
