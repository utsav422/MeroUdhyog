"""Chart-of-accounts management.

Accounts are tenant-scoped and additive. System accounts (seeded by the default
COA) can be renamed but cannot be deactivated or moved, because posting rules
reference their codes.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting import schemas
from app.modules.accounting.audit import record
from app.modules.accounting.models import Account
from app.modules.accounting.repository import AccountingRepository
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError

NORMAL_BALANCE = {
    "asset": "debit",
    "expense": "debit",
    "liability": "credit",
    "equity": "credit",
    "income": "credit",
}


class AccountService:
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        user_id: UUID | None = None,
    ) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.repo = AccountingRepository(session, tenant_id)

    async def list_accounts(
        self,
        *,
        account_type: str | None = None,
        is_group: bool | None = None,
        is_active: bool | None = None,
    ) -> list[Account]:
        return await self.repo.accounts(
            account_type=account_type,
            is_group=is_group,
            is_active=is_active,
        )

    async def create_account(self, data: schemas.AccountCreate) -> Account:
        code = data.code.strip().upper()
        name = data.name.strip()
        if not code or not name:
            raise ValidationError("Account code and name are required")
        if await self.repo.account_by_code(code) is not None:
            raise ConflictError(f"Account code {code} already exists")

        parent = None
        if data.parent_id is not None:
            parent = await self.repo.account(data.parent_id)
            if parent is None:
                raise ValidationError("Parent account not found")
            if not parent.is_group:
                raise ValidationError("Parent account must be a group")
            if parent.account_type != data.account_type:
                raise ValidationError("Parent account type must match")

        account = Account(
            tenant_id=self.tenant_id,
            code=code,
            name=name,
            account_type=data.account_type,
            normal_balance=data.normal_balance or NORMAL_BALANCE[data.account_type],
            parent_id=parent.id if parent else None,
            is_group=data.is_group,
            is_system=False,
            is_active=True,
            description=data.description,
        )
        self.session.add(account)
        await self.session.flush()
        await record(
            self.session,
            self.tenant_id,
            entity_type="account",
            entity_id=account.id,
            action="create",
            actor_id=self.user_id,
            after={
                "code": account.code,
                "name": account.name,
                "account_type": account.account_type,
                "normal_balance": account.normal_balance,
                "parent_id": str(account.parent_id) if account.parent_id else None,
                "is_group": account.is_group,
            },
        )
        return account

    async def update_account(self, account_id: UUID, data: schemas.AccountUpdate) -> Account:
        account = await self.repo.account(account_id)
        if account is None:
            raise NotFoundError("Account not found")

        payload = data.model_dump(exclude_unset=True)
        if account.is_system and {"parent_id", "is_active"} & payload.keys():
            raise ValidationError("System accounts cannot be moved or deactivated")

        if "parent_id" in payload:
            parent_id = payload["parent_id"]
            if parent_id is not None:
                parent = await self.repo.account(parent_id)
                if parent is None:
                    raise ValidationError("Parent account not found")
                if not parent.is_group:
                    raise ValidationError("Parent account must be a group")
                if parent.account_type != account.account_type:
                    raise ValidationError("Parent account type must match")
                if await self._would_cycle(account.id, parent.id):
                    raise ValidationError("Account hierarchy cannot contain a cycle")

        before = {
            "name": account.name,
            "parent_id": str(account.parent_id) if account.parent_id else None,
            "is_active": account.is_active,
            "description": account.description,
        }
        if "name" in payload:
            account.name = payload["name"].strip()
        if "description" in payload:
            account.description = payload["description"]
        if "parent_id" in payload:
            account.parent_id = payload["parent_id"]
        if "is_active" in payload and payload["is_active"] is not None:
            account.is_active = payload["is_active"]
        await self.session.flush()
        await record(
            self.session,
            self.tenant_id,
            entity_type="account",
            entity_id=account.id,
            action="update",
            actor_id=self.user_id,
            before=before,
            after={
                "name": account.name,
                "parent_id": str(account.parent_id) if account.parent_id else None,
                "is_active": account.is_active,
                "description": account.description,
            },
        )
        return account

    async def _would_cycle(self, account_id: UUID, parent_id: UUID) -> bool:
        current: UUID | None = parent_id
        seen: set[UUID] = set()
        while current is not None and current not in seen:
            if current == account_id:
                return True
            seen.add(current)
            parent = await self.repo.account(current)
            current = parent.parent_id if parent else None
        return False
