from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customers.csv_import import parse_customer_csv
from app.modules.customers.models import Customer
from app.modules.customers.repository import CustomerRepository
from app.modules.customers.schemas import CustomerCreate, CustomerRead, CustomerUpdate
from app.modules.orders.models import Order
from app.modules.routes.models import Route
from app.shared.exceptions import ConflictError, ValidationError

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _latlng(value: object, field: str, low: float, high: float) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"Invalid {field}: {value!r}") from None
    if not low <= parsed <= high:
        raise ValueError(f"{field} must be between {low} and {high}")
    return parsed


class CustomerService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = CustomerRepository(session, tenant_id)

    async def list(
        self, limit: int, offset: int, route_id: UUID | None = None
    ) -> list[CustomerRead]:
        customers = await self.repo.list(limit, offset, route_id)
        return [CustomerRead.model_validate(c) for c in customers]

    async def get(self, customer_id: UUID) -> CustomerRead:
        customer = await self.repo.get(customer_id)
        return CustomerRead.model_validate(customer)

    async def create(self, data: CustomerCreate) -> CustomerRead:
        await self._check_unique_email(data.email)
        customer = Customer(
            tenant_id=self.tenant_id,
            name=data.name,
            email=data.email,
            phone=data.phone,
            contact_number=data.contact_number,
            pan_no=data.pan_no,
            company=data.company,
            address=data.address,
            city=data.city,
            route_id=await self._resolve_route(data.route_id),
            latitude=data.latitude,
            longitude=data.longitude,
            notes=data.notes,
        )
        created = await self.repo.create(customer)
        return CustomerRead.model_validate(created)

    async def update(self, customer_id: UUID, data: CustomerUpdate) -> CustomerRead:
        customer = await self.repo.get(customer_id)
        if data.email:
            await self._check_unique_email(data.email, customer.id)
        updates = data.model_dump(exclude_unset=True)
        if "route_id" in updates:
            updates["route_id"] = await self._resolve_route(updates["route_id"])
            # Keep existing orders in sync: a customer's route change should
            # propagate to every order they already have.
            await self.session.execute(
                update(Order)
                .where(Order.customer_id == customer.id)
                .values(route_id=updates["route_id"])
            )
        for field, value in updates.items():
            setattr(customer, field, value)
        updated = await self.repo.update(customer)
        return CustomerRead.model_validate(updated)

    async def _resolve_route(self, route_id: UUID | None) -> UUID | None:
        if route_id is None:
            return None
        row = (
            await self.session.execute(
                select(Route.id).where(
                    Route.tenant_id == self.tenant_id, Route.id == route_id
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise ValidationError("route does not belong to this tenant")
        return route_id

    async def delete(self, customer_id: UUID) -> None:
        customer = await self.repo.get(customer_id)
        await self.repo.delete(customer)

    async def _find_by_email(self, email: str) -> Customer | None:
        return (
            await self.session.execute(
                select(Customer).where(
                    Customer.tenant_id == self.tenant_id, Customer.email == email
                )
            )
        ).scalar_one_or_none()

    async def get_or_create(self, email: str | None, **kw) -> tuple[Customer, bool]:
        if email:
            existing = await self._find_by_email(email)
            if existing:
                return existing, False
        customer = Customer(tenant_id=self.tenant_id, email=email, **kw)
        created = await self.repo.create(customer)
        return created, True

    async def _check_unique_email(self, email: str | None, *exclude: UUID) -> None:
        if not email:
            return
        existing = await self._find_by_email(email)
        if existing and existing.id not in exclude:
            raise ConflictError("A customer with this email already exists")

    async def create_from_csv(self, content: bytes) -> list:
        """Bulk-create customers from a CSV upload.

        Rows that fail validation (missing name, malformed email, bad
        coordinates, duplicate email) are reported per row while the valid
        rows are still created.
        """
        rows, fatal = parse_customer_csv(content)
        if fatal:
            raise ValidationError(fatal)
        for row in rows:
            data = row.data
            name = (data.get("name") or "").strip()
            if not name:
                row.error = "Missing customer name"
                continue
            email = (data.get("email") or "").strip()
            if email and not _EMAIL_RE.match(email):
                row.error = f"Invalid email: {email!r}"
                continue
            try:
                latitude = _latlng(data.get("latitude", ""), "latitude", -90, 90)
                longitude = _latlng(data.get("longitude", ""), "longitude", -180, 180)
            except ValueError as exc:
                row.error = str(exc)
                continue
            try:
                await self.create(
                    CustomerCreate(
                        name=name,
                        email=email or None,
                        phone=data.get("phone"),
                        contact_number=data.get("contact_number"),
                        pan_no=data.get("pan_no"),
                        company=data.get("company"),
                        address=data.get("address"),
                        city=data.get("city"),
                        latitude=latitude,
                        longitude=longitude,
                        notes=data.get("notes"),
                    )
                )
            except ConflictError as exc:
                row.error = exc.detail
            except Exception as exc:  # pragma: no cover - defensive row isolation
                row.error = f"Failed to create customer: {exc}"
        return rows
