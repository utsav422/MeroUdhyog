from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Permissions
from app.modules.roles.models import Role
from app.modules.roles.repository import RoleRepository
from app.modules.roles.schemas import RoleCreate, RoleRead, RoleUpdate
from app.shared.exceptions import ConflictError, ForbiddenError, ValidationError

VALID_PERMISSIONS = {p.value for p in Permissions}


class RoleService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = RoleRepository(session, tenant_id)

    @staticmethod
    def _serialize(role: Role) -> RoleRead:
        return RoleRead.model_validate(role)

    def _validate_permissions(self, permissions: list[str]) -> None:
        for perm in permissions:
            if perm not in VALID_PERMISSIONS:
                raise ValidationError(f"Unknown permission: {perm}")

    async def list(self, limit: int, offset: int) -> list[RoleRead]:
        roles = await self.repo.list(limit, offset)
        return [self._serialize(r) for r in roles]

    async def get(self, role_id: UUID) -> RoleRead:
        role = await self.repo.get(role_id)
        return self._serialize(role)

    async def create(self, data: RoleCreate) -> RoleRead:
        self._validate_permissions(data.permissions)
        if await self.repo.get_by_code(data.code):
            raise ConflictError("A role with this code already exists")
        role = Role(
            tenant_id=self.tenant_id,
            name=data.name,
            code=data.code,
            description=data.description,
            permissions=data.permissions,
        )
        created = await self.repo.create(role)
        return self._serialize(created)

    async def update(self, role_id: UUID, data: RoleUpdate) -> RoleRead:
        role = await self.repo.get(role_id)
        if role.is_system:
            raise ForbiddenError("System roles cannot be modified")
        if data.permissions is not None:
            self._validate_permissions(data.permissions)
        if data.name is not None:
            role.name = data.name
        if data.description is not None:
            role.description = data.description
        if data.permissions is not None:
            role.permissions = data.permissions
        if data.is_active is not None:
            role.is_active = data.is_active
        updated = await self.repo.update(role)
        return self._serialize(updated)

    async def delete(self, role_id: UUID) -> None:
        role = await self.repo.get(role_id)
        if role.is_system:
            raise ForbiddenError("System roles cannot be deleted")
        from app.modules.users.models import User

        count = (
            await self.session.execute(
                select(User.id)
                .where(User.tenant_id == self.tenant_id, User.role == role.code)
                .limit(1)
            )
        ).scalar_one_or_none()
        if count:
            raise ConflictError(
                f"Cannot delete role '{role.code}': users still assigned to it"
            )
        await self.repo.delete(role)
