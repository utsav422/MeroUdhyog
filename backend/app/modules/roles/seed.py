from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import ROLE_PERMISSIONS
from app.modules.roles.models import Role

# Built-in codes seeded for every tenant. 'owner' is the system super-role.
DEFAULT_ROLE_CODES = ("owner", "admin", "manager", "accountant", "collector", "worker", "delivery", "viewer")


async def seed_default_roles(session: AsyncSession, tenant_id: UUID) -> None:
    """Create the built-in roles for a tenant if they are missing."""
    existing = {
        r.code
        for r in (
            await session.execute(select(Role).where(Role.tenant_id == tenant_id))
        )
        .scalars()
        .all()
    }
    for code in DEFAULT_ROLE_CODES:
        if code in existing:
            continue
        permissions = sorted(p.value for p in ROLE_PERMISSIONS.get(code, set()))
        session.add(
            Role(
                tenant_id=tenant_id,
                name=code.title(),
                code=code,
                description=f"Built-in {code} role",
                permissions=permissions,
                is_system=(code == "owner"),
            )
        )
    await session.flush()
