from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customers.models import Customer
from app.shared.exceptions import NotFoundError


class CustomerRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def list(
        self, limit: int, offset: int, route_id: UUID | None = None
    ) -> list[Customer]:
        stmt = (
            select(Customer)
            .where(Customer.tenant_id == self.tenant_id)
            .order_by(Customer.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if route_id is not None:
            stmt = stmt.where(Customer.route_id == route_id)
        customers = (await self.session.execute(stmt)).scalars().all()
        return list(customers)

    async def get(self, customer_id: UUID) -> Customer:
        customer = (
            await self.session.execute(
                select(Customer).where(
                    Customer.id == customer_id, Customer.tenant_id == self.tenant_id
                )
            )
        ).scalar_one_or_none()
        if not customer:
            raise NotFoundError("Customer not found")
        return customer

    async def create(self, customer: Customer) -> Customer:
        self.session.add(customer)
        await self.session.flush()
        await self.session.refresh(customer)
        return customer

    async def update(self, customer: Customer) -> Customer:
        await self.session.flush()
        await self.session.refresh(customer)
        return customer

    async def delete(self, customer: Customer) -> None:
        await self.session.delete(customer)
        await self.session.flush()
