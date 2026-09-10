from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customers.models import Customer
from app.modules.finance.service import FinanceService, month_of_dt
from app.modules.products.models import Product
from app.modules.transaction_types.models import TransactionType
from app.modules.transactions.models import Transaction
from app.modules.transactions.repository import TransactionRepository
from app.modules.transactions.schemas import TransactionCreate, TransactionRead, TransactionUpdate
from app.shared.exceptions import ConflictError, ValidationError

REVERSAL_TYPE = {"sale": "purchase", "purchase": "sale", "expense": "expense"}


class TransactionService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = TransactionRepository(session, tenant_id)
        self.finance_service = FinanceService(session, tenant_id)

    async def list(
        self,
        limit: int,
        offset: int,
        type_: str | None = None,
        customer_id: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[TransactionRead]:
        transactions = await self.repo.list(
            limit, offset, type_, customer_id, date_from, date_to
        )
        return [TransactionRead.model_validate(t) for t in transactions]

    async def get(self, transaction_id: UUID) -> TransactionRead:
        transaction = await self.repo.get(transaction_id)
        return TransactionRead.model_validate(transaction)

    async def _validate_type(self, type_: str) -> None:
        """Ensure the type matches one of the tenant's defined transaction types."""
        exists = (
            await self.session.execute(
                select(TransactionType.id).where(
                    TransactionType.tenant_id == self.tenant_id,
                    TransactionType.code == type_,
                )
            )
        ).scalar_one_or_none()
        if not exists:
            raise ValidationError(
                f"type '{type_}' is not defined for this tenant. Add it under "
                "Transaction Types first (defaults: sale, purchase, expense)."
            )

    async def _validate_refs(self, customer_id: UUID | None, product_id: UUID | None) -> None:
        if customer_id:
            ok = (
                await self.session.execute(
                    select(Customer.id).where(
                        Customer.tenant_id == self.tenant_id, Customer.id == customer_id
                    )
                )
            ).scalar_one_or_none()
            if not ok:
                raise ValidationError("customer_id does not belong to this tenant")
        if product_id:
            ok = (
                await self.session.execute(
                    select(Product.id).where(
                        Product.tenant_id == self.tenant_id, Product.id == product_id
                    )
                )
            ).scalar_one_or_none()
            if not ok:
                raise ValidationError("product_id does not belong to this tenant")

    async def _enforce_external_unique(
        self, external_id: str | None, exclude: UUID | None = None
    ) -> None:
        if not external_id:
            return
        existing = await self.repo.get_by_external_id(external_id)
        if existing and existing.id != exclude:
            raise ConflictError("A transaction with this external_id already exists")

    async def create(self, data: TransactionCreate) -> TransactionRead:
        await self._validate_type(data.type)
        await self._validate_refs(data.customer_id, data.product_id)
        await self._enforce_external_unique(data.external_id)
        transaction = Transaction(
            tenant_id=self.tenant_id,
            type=data.type,
            transaction_date=data.transaction_date,
            external_id=data.external_id,
            quantity=data.quantity,
            unit_price=data.unit_price,
            amount=data.amount,
            tax_amount=data.tax_amount,
            discount_amount=data.discount_amount,
            currency=data.currency,
            description=data.description,
            customer_id=data.customer_id,
            product_id=data.product_id,
            metadata_=data.metadata_,
        )
        created = await self.repo.create(transaction)
        await self.finance_service.recalculate({month_of_dt(created.transaction_date)})
        return TransactionRead.model_validate(created)

    async def update(self, transaction_id: UUID, data: TransactionUpdate) -> TransactionRead:
        transaction = await self.repo.get(transaction_id)
        old_month = month_of_dt(transaction.transaction_date)
        updates = data.model_dump(exclude_unset=True)
        if "type" in updates:
            await self._validate_type(updates["type"])
        for field, value in updates.items():
            setattr(transaction, field, value)
        updated = await self.repo.update(transaction)
        months = {old_month}
        if "transaction_date" in updates:
            months.add(month_of_dt(updated.transaction_date))
            await self.finance_service.recalculate(months)
        return TransactionRead.model_validate(updated)

    async def delete(self, transaction_id: UUID) -> None:
        transaction = await self.repo.get(transaction_id)
        month = month_of_dt(transaction.transaction_date)
        await self.repo.delete(transaction)
        await self.finance_service.recalculate({month})

    async def reverse(self, transaction_id: UUID) -> TransactionRead:
        transaction = await self.repo.get(transaction_id)
        reversal_type = REVERSAL_TYPE.get(transaction.type, transaction.type)
        reversal = Transaction(
            tenant_id=self.tenant_id,
            type=reversal_type,
            transaction_date=datetime.now(transaction.transaction_date.tzinfo),
            external_id=None,
            quantity=transaction.quantity,
            unit_price=transaction.unit_price,
            amount=transaction.amount,
            tax_amount=transaction.tax_amount,
            discount_amount=transaction.discount_amount,
            currency=transaction.currency,
            description=f"Reverses {transaction.id}",
            customer_id=transaction.customer_id,
            product_id=transaction.product_id,
            reverses_id=transaction.id,
        )
        created = await self.repo.create(reversal)
        months = {month_of_dt(transaction.transaction_date)}
        if created.transaction_date:
            months.add(month_of_dt(created.transaction_date))
        await self.finance_service.recalculate(months)
        return TransactionRead.model_validate(created)

    async def create_from_dict(self, row: dict) -> Transaction | None:
        external_id = row.get("external_id")
        if external_id:
            existing = await self.repo.get_by_external_id(external_id)
            if existing:
                return None
        transaction = Transaction(
            tenant_id=self.tenant_id,
            type=row["type"],
            transaction_date=row["transaction_date"],
            external_id=external_id,
            quantity=row.get("quantity"),
            unit_price=row.get("unit_price"),
            amount=row["amount"],
            tax_amount=row.get("tax_amount", Decimal("0")),
            discount_amount=row.get("discount_amount", Decimal("0")),
            currency=row.get("currency", "USD"),
            description=row.get("description"),
            customer_id=row.get("customer_id"),
            product_id=row.get("product_id"),
        )
        return await self.repo.create(transaction)
