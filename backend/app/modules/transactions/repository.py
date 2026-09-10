from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.transactions.models import Transaction
from app.shared.exceptions import NotFoundError


class TransactionRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    def _base(self):
        return select(Transaction).where(Transaction.tenant_id == self.tenant_id)

    async def list(
        self,
        limit: int,
        offset: int,
        type_: str | None = None,
        customer_id: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[Transaction]:
        stmt = self._base()
        if type_:
            stmt = stmt.where(Transaction.type == type_)
        if customer_id:
            stmt = stmt.where(Transaction.customer_id == customer_id)
        if date_from:
            stmt = stmt.where(Transaction.transaction_date >= date_from)
        if date_to:
            stmt = stmt.where(Transaction.transaction_date <= date_to)
        rows = (
            (
                await self.session.execute(
                    stmt.order_by(Transaction.transaction_date.desc())
                    .limit(limit)
                    .offset(offset)
                )
            )
            .scalars()
            .all()
        )
        return list(rows)

    async def get(self, transaction_id: UUID) -> Transaction:
        transaction = (
            await self.session.execute(
                self._base().where(Transaction.id == transaction_id)
            )
        ).scalar_one_or_none()
        if not transaction:
            raise NotFoundError("Transaction not found")
        return transaction

    async def get_by_external_id(self, external_id: str) -> Transaction | None:
        return (
            await self.session.execute(
                self._base().where(Transaction.external_id == external_id)
            )
        ).scalar_one_or_none()

    async def create(self, transaction: Transaction) -> Transaction:
        self.session.add(transaction)
        await self.session.flush()
        await self.session.refresh(transaction)
        return transaction

    async def update(self, transaction: Transaction) -> Transaction:
        await self.session.flush()
        await self.session.refresh(transaction)
        return transaction

    async def delete(self, transaction: Transaction) -> None:
        await self.session.delete(transaction)
        await self.session.flush()
