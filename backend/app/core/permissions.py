from collections.abc import Callable
from enum import StrEnum
from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy import select

from app.core.dependencies import get_current_user_id, get_db
from app.modules.users.models import User


class Permissions(StrEnum):
    MANAGE_USERS = "manage_users"
    VIEW_ALL = "view_all"
    IMPORT_DATA = "import_data"
    MANAGE_SETTINGS = "manage_settings"
    MANAGE_CATALOG = "manage_catalog"
    MANAGE_CUSTOMERS = "manage_customers"
    MANAGE_TRANSACTIONS = "manage_transactions"
    MANAGE_ORDERS = "manage_orders"
    MANAGE_AUDITS = "manage_audits"
    VIEW_ASSIGNED_DELIVERIES = "view_assigned_deliveries"
    UPDATE_DELIVERY_STATUS = "update_delivery_status"


ROLE_PERMISSIONS: dict[str, set[Permissions]] = {
    "owner": set(Permissions),
    "admin": {
        Permissions.MANAGE_USERS,
        Permissions.VIEW_ALL,
        Permissions.IMPORT_DATA,
        Permissions.MANAGE_SETTINGS,
        Permissions.MANAGE_CATALOG,
        Permissions.MANAGE_CUSTOMERS,
        Permissions.MANAGE_TRANSACTIONS,
        Permissions.MANAGE_ORDERS,
        Permissions.MANAGE_AUDITS,
        Permissions.UPDATE_DELIVERY_STATUS,
    },
    "manager": {
        Permissions.VIEW_ALL,
        Permissions.MANAGE_CATALOG,
        Permissions.MANAGE_CUSTOMERS,
        Permissions.MANAGE_ORDERS,
        Permissions.UPDATE_DELIVERY_STATUS,
    },
    "accountant": {
        Permissions.VIEW_ALL,
        Permissions.IMPORT_DATA,
        Permissions.MANAGE_TRANSACTIONS,
        Permissions.MANAGE_AUDITS,
        Permissions.VIEW_ASSIGNED_DELIVERIES,
    },
    "worker": {
        Permissions.VIEW_ALL,
        Permissions.MANAGE_ORDERS,
    },
    "delivery": {
        Permissions.VIEW_ASSIGNED_DELIVERIES,
        Permissions.UPDATE_DELIVERY_STATUS,
    },
    "viewer": {
        Permissions.VIEW_ALL,
    },
}


def require_permission(permission: Permissions) -> Callable:
    async def dependency(
        user_id=Depends(get_current_user_id),
        db=Depends(get_db),
    ) -> None:
        if not await has_permission(db, user_id, permission):
            raise HTTPException(status_code=403, detail="Insufficient permissions")

    return dependency


def require_any_permission(*permissions: Permissions) -> Callable:
    """Require the caller to hold at least one of the given permissions."""

    async def dependency(
        user_id=Depends(get_current_user_id),
        db=Depends(get_db),
    ) -> None:
        user = (
            await db.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        if user.is_superadmin or user.role == "owner":
            return
        allowed = await _role_permissions(db, user.tenant_id, user.role)
        if not any(p in allowed for p in permissions):
            raise HTTPException(status_code=403, detail="Insufficient permissions")

    return dependency


async def has_permission(db, user_id: UUID, permission: Permissions) -> bool:
    """Return whether the given user holds the permission (or is owner/superadmin)."""
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        return False
    if user.is_superadmin or user.role == "owner":
        return True
    permissions = await _role_permissions(db, user.tenant_id, user.role)
    return permission in permissions


async def _role_permissions(db, tenant_id: UUID, role: str) -> set[Permissions]:
    """Return the permission set for a role, reading from the tenant's roles.

    Falls back to the built-in mapping when the tenant's role table is missing
    a row (e.g. before seeding) so nothing breaks during migration.
    """
    from app.modules.roles.models import Role

    row = (
        await db.execute(
            select(Role).where(
                Role.tenant_id == tenant_id, Role.code == role
            )
        )
    ).scalar_one_or_none()
    if row is not None and row.permissions:
        result: set[Permissions] = set()
        for p in row.permissions:
            try:
                result.add(Permissions(p))
            except ValueError:
                # Unknown/legacy permission string — ignore rather than crash.
                continue
        return result
    return ROLE_PERMISSIONS.get(role, set())
