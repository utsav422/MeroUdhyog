from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.routes.models import Route, RouteAgent, RouteCity
from app.modules.routes.repository import RouteRepository
from app.modules.routes.schemas import RouteCreate, RouteRead, RouteUpdate
from app.modules.users.models import User
from app.shared.exceptions import NotFoundError


class RouteService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = RouteRepository(session, tenant_id)

    async def list(self, limit: int, offset: int) -> list[RouteRead]:
        routes = await self.repo.list(limit, offset)
        return [self._serialize(r) for r in routes]

    async def get(self, route_id: UUID) -> RouteRead:
        route = await self.repo.get(route_id)
        return self._serialize(route)

    def _serialize(self, route: Route) -> RouteRead:
        return RouteRead(
            id=route.id,
            tenant_id=route.tenant_id,
            name=route.name,
            description=route.description,
            is_active=route.is_active,
            cities=[rc.city for rc in route.cities],
            agent_ids=[ra.agent_id for ra in route.agents],
            created_at=route.created_at,
            updated_at=route.updated_at,
        )

    async def _validate_agent_ids(self, agent_ids: list[UUID]) -> None:
        for agent_id in agent_ids:
            ok = (
                await self.session.execute(
                    select(User.id).where(
                        User.tenant_id == self.tenant_id, User.id == agent_id
                    )
                )
            ).scalar_one_or_none()
            if not ok:
                raise NotFoundError(f"Agent {agent_id} not found")

    async def create(self, data: RouteCreate) -> RouteRead:
        await self._validate_agent_ids(data.agent_ids)
        route = Route(
            tenant_id=self.tenant_id,
            name=data.name,
            description=data.description,
        )
        route.cities = [RouteCity(tenant_id=self.tenant_id, city=c) for c in data.cities]
        route.agents = [
            RouteAgent(tenant_id=self.tenant_id, agent_id=a) for a in data.agent_ids
        ]
        created = await self.repo.create(route)
        return self._serialize(created)

    async def update(self, route_id: UUID, data: RouteUpdate) -> RouteRead:
        route = await self.repo.get(route_id)
        if data.name is not None:
            route.name = data.name
        if data.description is not None:
            route.description = data.description
        if data.is_active is not None:
            route.is_active = data.is_active
        updates = data.model_dump(exclude_unset=True)
        if "cities" in updates:
            route.cities.clear()
            await self.session.flush()
            route.cities = [
                RouteCity(tenant_id=self.tenant_id, city=c) for c in updates["cities"]
            ]
        if "agent_ids" in updates:
            await self._validate_agent_ids(updates["agent_ids"])
            route.agents.clear()
            await self.session.flush()
            route.agents = [
                RouteAgent(tenant_id=self.tenant_id, agent_id=a)
                for a in updates["agent_ids"]
            ]
        updated = await self.repo.update(route)
        return self._serialize(updated)

    async def delete(self, route_id: UUID) -> None:
        route = await self.repo.get(route_id)
        await self.repo.delete(route)

    async def find_agent_id_for_city(self, city: str | None) -> UUID | None:
        """Return the first assigned agent id for the route covering a city."""
        if not city:
            return None
        route = await self.repo.find_by_city(city)
        if not route:
            return None
        if route.agents:
            return route.agents[0].agent_id
        return None
