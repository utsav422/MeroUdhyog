from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.routes.models import Route, RouteCity
from app.shared.exceptions import NotFoundError


class RouteRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def list(self, limit: int, offset: int) -> list[Route]:
        result = await self.session.execute(
            select(Route)
            .options(selectinload(Route.cities), selectinload(Route.agents))
            .where(Route.tenant_id == self.tenant_id)
            .order_by(Route.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().unique().all())

    async def get(self, route_id: UUID) -> Route:
        result = await self.session.execute(
            select(Route)
            .options(selectinload(Route.cities), selectinload(Route.agents))
            .where(Route.id == route_id, Route.tenant_id == self.tenant_id)
        )
        row = result.scalars().unique().one_or_none()
        if not row:
            raise NotFoundError("Route not found")
        return row

    async def create(self, route: Route) -> Route:
        self.session.add(route)
        await self.session.flush()
        return await self.get(route.id)

    async def update(self, route: Route) -> Route:
        await self.session.flush()
        return await self.get(route.id)

    async def delete(self, route: Route) -> None:
        await self.session.delete(route)
        await self.session.flush()

    async def find_by_city(self, city: str) -> Route | None:
        result = await self.session.execute(
            select(Route)
            .join(RouteCity, RouteCity.route_id == Route.id)
            .options(selectinload(Route.cities), selectinload(Route.agents))
            .where(
                Route.tenant_id == self.tenant_id,
                Route.is_active.is_(True),
                RouteCity.city == city,
            )
            .limit(1)
        )
        return result.scalars().unique().one_or_none()
