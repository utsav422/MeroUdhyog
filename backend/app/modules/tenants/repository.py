from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tenants.models import Tenant


class TenantRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, tenant_id: UUID) -> Tenant | None:
        return await self.session.get(Tenant, tenant_id)

    async def get_by_slug(self, slug: str) -> Tenant | None:
        from sqlalchemy import select

        result = await self.session.execute(select(Tenant).where(Tenant.slug == slug))
        return result.scalar_one_or_none()

    async def create(self, name: str, slug: str) -> Tenant:
        tenant = Tenant(name=name, slug=slug)
        self.session.add(tenant)
        await self.session.flush()
        await self.session.refresh(tenant)
        return tenant

    async def list(self) -> list[Tenant]:
        from sqlalchemy import select

        result = await self.session.execute(select(Tenant).order_by(Tenant.created_at))
        return list(result.scalars().all())