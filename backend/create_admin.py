"""Generate admin credentials and create the admin user in the database.

FastAdmin (free version) has no CLI to bootstrap a superuser: before you can
log in at /admin, a matching row must already exist in the ``users`` table.
Run this script on the server after migrations:

    cd backend
    python create_admin.py                  # auto-generates username + password
    python create_admin.py --username admin@example.com --password 'S3cure!pw'

It prints the credentials once. It is re-runnable: re-running with an existing
username resets that user's password to the given/auto-generated one.
"""

import argparse
import asyncio
import secrets
import string

from sqlalchemy import select

from app.core.database import get_session, init_db
from app.core.security import get_password_hash
from app.modules.roles.seed import seed_default_roles
from app.modules.tenants.models import Tenant
from app.modules.transaction_types.repository import seed_default_transaction_types
from app.modules.users.models import User

DEFAULT_ADMIN_TENANT_SLUG = "platform"


def generate_username() -> str:
    """Return a unique, plausible admin email."""
    local = f"admin-{secrets.token_hex(4)}"
    return f"{local}@factory-os.local"


def generate_password(length: int = 20) -> str:
    """Return a secure random password with at least one char of each class."""
    letters_and_digits = string.ascii_letters + string.digits
    special = "!@#$%^&*()-_=+"
    pwd = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
        secrets.choice(special),
    ]
    pwd += [secrets.choice(letters_and_digits + special) for _ in range(length - 4)]
    secrets.SystemRandom().shuffle(pwd)
    return "".join(pwd)


async def _ensure_tenant(username: str) -> Tenant:
    async with get_session() as session:
        tenant = (
            await session.execute(
                select(Tenant).where(Tenant.slug == DEFAULT_ADMIN_TENANT_SLUG)
            )
        ).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(name=username, slug=DEFAULT_ADMIN_TENANT_SLUG)
            session.add(tenant)
            await session.flush()
    return tenant


async def create_admin(username: str | None, password: str | None) -> dict[str, str]:
    """Create (or update) the admin user and print generated credentials.

    The first user created on a fresh database becomes the platform
    superadmin so /admin login works right away.
    """
    username = (username or "").strip().lower() or generate_username()
    password = password or generate_password()

    tenant = await _ensure_tenant(username)

    async with get_session() as session:
        user = (
            await session.execute(select(User).where(User.email == username))
        ).scalar_one_or_none()
        if user is None:
            superadmin_exists = (
                (
                    await session.execute(
                        select(User.id).where(User.is_superadmin.is_(True)).limit(1)
                    )
                ).scalar_one_or_none()
                is not None
            )
            user = User(
                tenant_id=tenant.id,
                email=username,
                hashed_password=get_password_hash(password),
                full_name="Platform Admin",
                role="owner",
                status="active",
                is_active=True,
                is_superadmin=not superadmin_exists,
            )
            session.add(user)
            await session.flush()
            await seed_default_roles(session, tenant.id)
            await seed_default_transaction_types(session, tenant.id)
        else:
            user.hashed_password = get_password_hash(password)
            user.status = "active"
            user.is_active = True
            await session.flush()

    return {
        "username": username,
        "password": password,
        "tenant_slug": tenant.slug,
        "user_id": str(user.id),
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", default=None, help="Admin email (default: generated)")
    parser.add_argument("--password", default=None, help="Admin password (default: generated)")
    return parser.parse_args()


async def _main() -> None:
    args = _parse_args()
    init_db()
    result = await create_admin(args.username, args.password)
    print("Admin credentials generated/updated:")
    print(f"  URL      : /admin")
    print(f"  Username : {result['username']}")
    print(f"  Password : {result['password']}")
    print(f"  Tenant   : {result['tenant_slug']}")
    print("Store these securely. They are shown only once.")


if __name__ == "__main__":
    asyncio.run(_main())