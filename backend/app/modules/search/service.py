from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.categories.models import Category
from app.modules.customers.models import Customer
from app.modules.deliveries.models import Delivery
from app.modules.khata.models import LedgerEntry
from app.modules.orders.models import Order
from app.modules.products.models import Product, ProductVariant
from app.modules.routes.models import Route, RouteCity
from app.modules.transactions.models import Transaction
from app.modules.users.models import User
from app.modules.search.schemas import SearchGroup, SearchHit

ESCAPE = "\\"


def _match(q: str, *columns):
    """ILIKE across several columns, escaping the wildcard characters."""
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    return [column.ilike(pattern, escape=ESCAPE) for column in columns]


def _short(uuid: UUID) -> str:
    return str(uuid)[:8]


class GlobalSearchService:
    """Tenant-scoped search across the tenant's records.

    Every query pins ``tenant_id`` to the authenticated tenant so results
    never leak across workspaces.
    """

    def __init__(self, db: AsyncSession, tenant_id: UUID, limit: int = 5):
        self.db = db
        self.tenant_id = tenant_id
        self.limit = limit

    async def search(self, q: str) -> list[SearchGroup]:
        if not q or len(q) < 1:
            return []
        groups: list[SearchGroup] = []
        for label, group in (
            ("Products", self._products),
            ("Categories", self._categories),
            ("Customers", self._customers),
            ("Orders", self._orders),
            ("Deliveries", self._deliveries),
            ("Staff", self._staff),
            ("Routes", self._routes),
            ("Payments", self._payments),
            ("Finance", self._finance),
        ):
            items = await group(q)
            if items:
                groups.append(SearchGroup(key=label.lower(), label=label, items=items))
        return groups

    async def _products(self, q: str) -> list[SearchHit]:
        stmt = (
            select(Product, ProductVariant)
            .join(ProductVariant, ProductVariant.product_id == Product.id, isouter=True)
            .where(
                Product.tenant_id == self.tenant_id,
                or_(
                    *_match(
                        q,
                        Product.name,
                        Product.sku,
                        Product.description,
                        ProductVariant.name,
                        ProductVariant.sku,
                        ProductVariant.size,
                    )
                ),
            )
            .order_by(Product.name.asc(), ProductVariant.sort_order.asc())
            .limit(self.limit * 3)
        )
        rows = (await self.db.execute(stmt)).all()
        hits: list[SearchHit] = []
        seen: set[UUID] = set()
        for product, variant in rows:
            if product.id in seen:
                continue
            seen.add(product.id)
            variant_name = variant.name if variant else None
            hits.append(
                SearchHit(
                    type="product",
                    id=str(product.id),
                    title=product.name,
                    subtitle=variant_name or (product.sku or "Product"),
                    meta=None,
                    href=f"/products/{product.id}",
                )
            )
            if len(hits) >= self.limit:
                break
        return hits

    async def _categories(self, q: str) -> list[SearchHit]:
        stmt = (
            select(Category)
            .where(
                Category.tenant_id == self.tenant_id,
                or_(*_match(q, Category.name, Category.description)),
            )
            .order_by(Category.name.asc())
            .limit(self.limit)
        )
        rows = (await self.db.execute(stmt)).scalars().all()
        return [
            SearchHit(
                type="category",
                id=str(c.id),
                title=c.name,
                subtitle=c.description,
                href="/categories",
            )
            for c in rows
        ]

    async def _customers(self, q: str) -> list[SearchHit]:
        stmt = (
            select(Customer)
            .where(
                Customer.tenant_id == self.tenant_id,
                or_(
                    *_match(
                        q,
                        Customer.name,
                        Customer.phone,
                        Customer.email,
                        Customer.company,
                        Customer.pan_no,
                        Customer.city,
                    )
                ),
            )
            .order_by(Customer.name.asc())
            .limit(self.limit)
        )
        rows = (await self.db.execute(stmt)).scalars().all()
        return [
            SearchHit(
                type="customer",
                id=str(c.id),
                title=c.name,
                subtitle=c.phone or c.email or c.company,
                meta=c.city,
                href=f"/customers/{c.id}",
            )
            for c in rows
        ]

    async def _orders(self, q: str) -> list[SearchHit]:
        stmt = (
            select(Order, Customer)
            .join(Customer, Customer.id == Order.customer_id, isouter=True)
            .where(
                Order.tenant_id == self.tenant_id,
                or_(*_match(q, Order.order_ref, Customer.name, Customer.phone)),
            )
            .order_by(Order.created_at.desc())
            .limit(self.limit)
        )
        rows = (await self.db.execute(stmt)).all()
        return [
            SearchHit(
                type="order",
                id=str(order.id),
                title=f"Order {order.order_ref}",
                subtitle=customer.name if customer else "No customer",
                meta=f"{order.status} · {order.payment_status}",
                href=f"/orders/{order.id}",
            )
            for order, customer in rows
        ]

    async def _deliveries(self, q: str) -> list[SearchHit]:
        stmt = (
            select(Delivery, Order, User)
            .join(Order, Order.id == Delivery.order_id)
            .join(User, User.id == Delivery.delivery_agent_id, isouter=True)
            .where(
                Delivery.tenant_id == self.tenant_id,
                or_(*_match(q, Order.order_ref, User.full_name)),
            )
            .order_by(Delivery.created_at.desc())
            .limit(self.limit)
        )
        rows = (await self.db.execute(stmt)).all()
        return [
            SearchHit(
                type="delivery",
                id=str(delivery.id),
                title=f"Delivery · {order.order_ref}",
                subtitle=agent.full_name if agent else "Unassigned",
                meta=delivery.status,
                href=f"/orders/{order.id}",
            )
            for delivery, order, agent in rows
        ]

    async def _staff(self, q: str) -> list[SearchHit]:
        stmt = (
            select(User)
            .where(
                User.tenant_id == self.tenant_id,
                or_(*_match(q, User.full_name, User.email)),
            )
            .order_by(User.full_name.asc())
            .limit(self.limit)
        )
        rows = (await self.db.execute(stmt)).scalars().all()
        return [
            SearchHit(
                type="staff",
                id=str(u.id),
                title=u.full_name,
                subtitle=u.email,
                meta=u.role,
                href="/staff",
            )
            for u in rows
        ]

    async def _routes(self, q: str) -> list[SearchHit]:
        stmt = (
            select(Route, RouteCity)
            .join(RouteCity, RouteCity.route_id == Route.id, isouter=True)
            .where(
                Route.tenant_id == self.tenant_id,
                or_(*_match(q, Route.name, RouteCity.city, Route.description)),
            )
            .order_by(Route.name.asc())
            .limit(self.limit)
        )
        rows = (await self.db.execute(stmt)).all()
        hits: list[SearchHit] = []
        seen: set[UUID] = set()
        for route, city in rows:
            if route.id in seen:
                continue
            seen.add(route.id)
            hits.append(
                SearchHit(
                    type="route",
                    id=str(route.id),
                    title=route.name,
                    subtitle=city.city if city else None,
                    href="/routes",
                )
            )
            if len(hits) >= self.limit:
                break
        return hits

    async def _payments(self, q: str) -> list[SearchHit]:
        stmt = (
            select(LedgerEntry, Customer)
            .join(Customer, Customer.id == LedgerEntry.customer_id, isouter=True)
            .where(
                LedgerEntry.tenant_id == self.tenant_id,
                or_(
                    *_match(
                        q,
                        LedgerEntry.receipt_number,
                        Customer.name,
                        LedgerEntry.method,
                        LedgerEntry.note,
                    )
                ),
            )
            .order_by(LedgerEntry.collected_at.desc())
            .limit(self.limit)
        )
        rows = (await self.db.execute(stmt)).all()
        return [
            SearchHit(
                type="payment",
                id=str(entry.id),
                title=entry.receipt_number or f"{_short(entry.id)}",
                subtitle=customer.name if customer else None,
                meta=f"{entry.amount} · {entry.status}",
                href="/payments",
            )
            for entry, customer in rows
        ]

    async def _finance(self, q: str) -> list[SearchHit]:
        stmt = (
            select(Transaction, Customer)
            .join(Customer, Customer.id == Transaction.customer_id, isouter=True)
            .where(
                Transaction.tenant_id == self.tenant_id,
                or_(
                    *_match(
                        q,
                        Transaction.external_id,
                        Transaction.description,
                        Transaction.type,
                        Customer.name,
                    )
                ),
            )
            .order_by(Transaction.transaction_date.desc())
            .limit(self.limit)
        )
        rows = (await self.db.execute(stmt)).all()
        return [
            SearchHit(
                type="transaction",
                id=str(txn.id),
                title=txn.description or txn.external_id or f"{_short(txn.id)}",
                subtitle=customer.name if customer else None,
                meta=f"{txn.type} · {txn.amount} {txn.currency}",
                href="/finance",
            )
            for txn, customer in rows
        ]