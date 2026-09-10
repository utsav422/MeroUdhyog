from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tenants.models import Tenant
from app.modules.tenants.repository import TenantRepository
from app.shared.exceptions import NotFoundError


class TenantService:
    def __init__(self, session: AsyncSession):
        self.repo = TenantRepository(session)

    async def get_current(self, tenant_id: UUID) -> Tenant:
        tenant = await self.repo.get_by_id(tenant_id)
        if not tenant:
            raise NotFoundError("Tenant not found")
        return tenant
