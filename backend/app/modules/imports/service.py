from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customers.service import CustomerService
from app.modules.finance.service import FinanceService
from app.modules.imports.models import ImportBatch
from app.modules.imports.repository import ImportRepository
from app.modules.imports.schemas import (
    ImportBatchRead,
    ImportRequest,
    ImportRowErrorRead,
    ImportRowInput,
)
from app.modules.products.models import Product
from app.modules.transactions.models import Transaction
from app.modules.transactions.service import TransactionService

ALLOWED_TYPES = {"sale", "purchase", "expense"}


class ImportService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = ImportRepository(session, tenant_id)
        self.transaction_service = TransactionService(session, tenant_id)
        self.customer_service = CustomerService(session, tenant_id)
        self.finance_service = FinanceService(session, tenant_id)

    async def list_batches(self, limit: int, offset: int) -> list[ImportBatchRead]:
        batches = await self.repo.list_batches(limit, offset)
        return [ImportBatchRead.model_validate(b) for b in batches]

    async def get_batch(self, batch_id: UUID) -> ImportBatch:
        return await self.repo.get_batch(batch_id)

    async def list_row_errors(
        self, batch_id: UUID, limit: int, offset: int
    ) -> list[ImportRowErrorRead]:
        # ensure the batch belongs to this tenant before listing its errors
        await self.repo.get_batch(batch_id)
        errors = await self.repo.list_row_errors(batch_id, limit, offset)
        return [ImportRowErrorRead.model_validate(e) for e in errors]

    async def submit(self, request: ImportRequest) -> ImportBatch:
        batch = await self.repo.create_batch(request.filename, len(request.rows))
        records = [r.model_dump(mode="json") for r in request.rows]
        return await self._run_records(batch, records)

    async def upload(self, filename: str, content: bytes) -> ImportBatch:
        from app.modules.imports.parser import parse_import_file

        records = parse_import_file(filename, content)
        batch = await self.repo.create_batch(filename, len(records))
        return await self._run_records(batch, records)

    async def _run_records(
        self, batch: ImportBatch, records: list[dict]
    ) -> ImportBatch:
        success = 0
        errors = 0
        success_months: set[date] = set()
        for index, record in enumerate(records, start=1):
            try:
                row = ImportRowInput.model_validate(record)
                await self._process_row(batch.id, row)
                success += 1
                success_months.add(
                    date(row.transaction_date.year, row.transaction_date.month, 1)
                )
            except ValidationError as exc:
                for err in exc.errors():
                    loc = err.get("loc")
                    field = str(loc[0]) if loc else None
                    await self.repo.add_row_error(
                        batch.id, index, err.get("msg", "invalid row"), field, record
                    )
                    errors += 1
            except Exception as exc:  # noqa: BLE001 - record any per-row failure
                field, message = _classify_error(exc)
                await self.repo.add_row_error(
                    batch.id, index, message, field, record
                )
                errors += 1
        result = await self.repo.set_counts(batch, success, errors)
        if success_months:
            await self.finance_service.recalculate(success_months)
        return result

    async def _process_row(self, batch_id, row) -> None:
        if row.type not in ALLOWED_TYPES:
            raise ValueError("type must be one of sale, purchase, expense")

        customer_id: UUID | None = None
        if row.customer_email:
            customer, _ = await self.customer_service.get_or_create(
                email=row.customer_email, name=row.customer_email.split("@")[0] or "Unknown"
            )
            customer_id = customer.id

        product_id: UUID | None = None
        if row.product_sku:
            product = (
                await self.session.execute(
                    select(Product.id).where(
                        Product.tenant_id == self.tenant_id, Product.sku == row.product_sku
                    )
                )
            ).scalar_one_or_none()
            if not product:
                raise ValueError(f"product_sku '{row.product_sku}' not found")
            product_id = product

        transaction = Transaction(
            tenant_id=self.tenant_id,
            type=row.type,
            transaction_date=_to_dt(row.transaction_date),
            external_id=row.external_id,
            quantity=_to_dec(row.quantity),
            unit_price=_to_dec(row.unit_price),
            amount=_to_dec(row.amount, required=True),
            tax_amount=_to_dec(row.tax_amount),
            discount_amount=_to_dec(row.discount_amount),
            currency=(row.currency or "USD").upper(),
            description=row.description,
            customer_id=customer_id,
            product_id=product_id,
        )
        await self.transaction_service.repo.create(transaction)


def _classify_error(exc: Exception) -> tuple[str | None, str]:
    message = str(exc) or exc.__class__.__name__
    if isinstance(exc, KeyError):
        return str(exc).strip("'"), message
    return None, message


def _to_dec(value: str | None, required: bool = False) -> Decimal | None:
    if value is None or value == "":
        if required:
            raise ValueError("amount is required")
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError):
        raise ValueError(f"invalid decimal value '{value}'") from None


def _to_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value
