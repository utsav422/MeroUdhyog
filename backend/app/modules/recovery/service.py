"""Recovery (soft delete) service.

Every destructive action in the app funnels through this module. A delete marks
the record (and everything that depends on it) with ``deleted_at`` and writes a
``RecoveryItem`` so the Recovery page can show it in the right tab. Only this
service can restore or permanently remove a trashed record.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.soft_delete import ADMIN_RECOVERY_DAYS, USER_RECOVERY_DAYS
from app.modules.categories.models import Category
from app.modules.customers.models import Customer
from app.modules.deliveries.models import Delivery
from app.modules.khata.models import LedgerAllocation, LedgerEntry
from app.modules.orders.models import Order
from app.modules.products.models import Product, ProductVariant
from app.modules.recovery.models import RecoveryItem
from app.modules.recovery.schemas import RecoveryItemRead, RecoveryList
from app.modules.users.models import User
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError

ENTITY_MODELS: dict[str, type] = {
    "customer": Customer,
    "order": Order,
    "delivered_order": Delivery,
    "khata": Order,
    "payment": LedgerEntry,
    "product": Product,
    "variant": ProductVariant,
    "staff": User,
    "category": Category,
}

ENTITY_LABELS: dict[str, str] = {
    "customer": "Customer",
    "order": "Order",
    "delivered_order": "Delivered order",
    "khata": "Khata entry",
    "payment": "Payment",
    "product": "Product",
    "variant": "Variant",
    "staff": "Staff member",
    "category": "Category",
}


@dataclass
class _Node:
    entity_type: str
    entity_id: UUID
    label: str
    detail: dict[str, Any] = field(default_factory=dict)
    depends: list[int] = field(default_factory=list)

    @property
    def model(self) -> type:
        return ENTITY_MODELS[self.entity_type]


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


class RecoveryService:
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        user_id: UUID | None = None,
        *,
        admin_override: bool = False,
    ):
        self.session = session
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.admin_override = admin_override
        self.is_admin = admin_override

    async def resolve_admin(self) -> bool:
        if self.admin_override:
            return True
        if self.user_id is None:
            return False
        user = await self._entity(User, self.user_id)
        self.is_admin = bool(user and user.is_superadmin)
        return self.is_admin

    # ---- listing ----------------------------------------------------------------

    async def list_items(
        self,
        *,
        entity_type: str | None = None,
        search: str | None = None,
        limit: int = 100,
        offset: int = 0,
        admin_scope: bool = False,
    ) -> RecoveryList:
        if admin_scope or self.is_admin:
            await self.resolve_admin()
        admin = self.is_admin
        cutoff = _now() - timedelta(days=ADMIN_RECOVERY_DAYS if admin else USER_RECOVERY_DAYS)
        stmt = (
            select(RecoveryItem)
            .where(
                RecoveryItem.tenant_id == self.tenant_id,
                RecoveryItem.state == "trashed",
                RecoveryItem.deleted_at >= cutoff,
            )
            .order_by(RecoveryItem.deleted_at.desc(), RecoveryItem.created_at.desc())
        )
        if entity_type:
            stmt = stmt.where(RecoveryItem.entity_type == entity_type)
        like = (search or "").strip().lower()
        if like:
            stmt = stmt.where(RecoveryItem.label.ilike(f"%{like}%"))
        rows = list((await self.session.execute(stmt)).scalars().all())
        counts: dict[str, int] = {}
        for row in rows:
            counts[row.entity_type] = counts.get(row.entity_type, 0) + 1
        graph = await self._graph()
        reads = [self._to_read(row, graph, admin=admin) for row in rows[offset : offset + limit]]
        return RecoveryList(items=reads, total=len(rows), counts=counts, admin=admin)

    def _to_read(
        self, item: RecoveryItem, graph: dict[str, RecoveryItem], *, admin: bool
    ) -> RecoveryItemRead:
        expires_at, purge_at = RecoveryItemRead.expiry(item.deleted_at, admin=admin)
        blocked_by = None
        for dep_id in item.depends_on:
            parent = graph.get(dep_id)
            if parent is None:
                blocked_by = "Parent was permanently deleted"
                break
            if parent.state == "trashed":
                blocked_by = parent.label
                break
        expired = _now() > expires_at
        return RecoveryItemRead(
            id=item.id,
            entity_type=item.entity_type,
            entity_id=item.entity_id,
            label=item.label,
            detail=dict(item.detail or {}),
            depends_on=list(item.depends_on or []),
            batch_id=item.batch_id,
            state=item.state,
            deleted_at=item.deleted_at,
            expires_at=expires_at,
            purge_at=purge_at,
            can_restore=not blocked_by and not expired,
            blocked_by=blocked_by or ("Recovery window closed" if expired else None),
        )

    # ---- soft delete ------------------------------------------------------------

    async def soft_delete_customer(self, customer_id: UUID, *, reason: str | None = None) -> None:
        customer = await self._entity(Customer, customer_id)
        if customer is None:
            raise NotFoundError("Customer not found")
        nodes = [
            _Node(
                "customer",
                customer.id,
                customer.name,
                {"customer_name": customer.name, "phone": customer.phone, "reason": reason},
            )
        ]
        payment_indexes: dict[UUID, int] = {}
        orders = (
            await self.session.execute(
                select(Order)
                .where(Order.tenant_id == self.tenant_id, Order.customer_id == customer.id)
                .order_by(Order.created_at.desc())
            )
        ).scalars().all()
        for order in orders:
            index = await self._add_order_nodes(nodes, order, customer.name, [0], payment_indexes)
            _ = index
        await self._add_unallocated_payments(nodes, customer.id, [0], payment_indexes)
        await self._save_plan(nodes)

    async def soft_delete_order(self, order_id: UUID, *, reason: str | None = None) -> None:
        order = await self._entity(Order, order_id)
        if order is None:
            raise NotFoundError("Order not found")
        customer_name = await self._customer_name(order.customer_id)
        nodes = [
            _Node(
                "order",
                order.id,
                f"{order.order_ref} · {customer_name}" if customer_name else order.order_ref,
                {
                    "order_ref": order.order_ref,
                    "customer_name": customer_name,
                    "ordered_at": _iso(order.created_at),
                    "reason": reason,
                },
            )
        ]
        payment_indexes: dict[UUID, int] = {}
        await self._add_order_nodes(
            nodes, order, customer_name, [], payment_indexes, include_order=False
        )
        await self._save_plan(nodes)

    async def soft_delete_delivery(self, delivery_id: UUID, *, reason: str | None = None) -> None:
        delivery = await self._entity(Delivery, delivery_id)
        if delivery is None:
            raise NotFoundError("Delivery not found")
        order = await self._entity(Order, delivery.order_id)
        if order is None:
            raise NotFoundError("Order for delivery not found")
        customer_name = await self._customer_name(order.customer_id)
        order.status = "ready"
        await self.session.flush()
        await self._save_plan(
            [
                _Node(
                    "delivered_order",
                    delivery.id,
                    f"Delivery · {order.order_ref}",
                    {
                        "order_ref": order.order_ref,
                        "customer_name": customer_name,
                        "order_status": order.status,
                        "delivered_at": _iso(delivery.delivered_at),
                        "reason": reason,
                    },
                )
            ]
        )

    async def soft_delete_payment(self, payment_id: UUID, *, reason: str | None = None) -> None:
        entry = await self._entity(LedgerEntry, payment_id)
        if entry is None:
            raise NotFoundError("Payment not found")
        customer_name = await self._customer_name(entry.customer_id)
        await self._save_plan(
            [
                _Node(
                    "payment",
                    entry.id,
                    self._payment_label(entry.receipt_number, customer_name),
                    {
                        "receipt_number": entry.receipt_number,
                        "customer_name": customer_name,
                        "amount": str(entry.amount),
                        "collected_at": _iso(entry.collected_at),
                        "reason": reason,
                    },
                )
            ]
        )

    async def soft_delete_product(self, product_id: UUID, *, reason: str | None = None) -> None:
        product = await self._entity(Product, product_id)
        if product is None:
            raise NotFoundError("Product not found")
        nodes = [
            _Node(
                "product",
                product.id,
                product.name,
                {"product_name": product.name, "sku": product.sku, "reason": reason},
            )
        ]
        variants = (
            await self.session.execute(
                select(ProductVariant)
                .where(
                    ProductVariant.tenant_id == self.tenant_id,
                    ProductVariant.product_id == product.id,
                )
                .order_by(ProductVariant.sort_order, ProductVariant.name)
            )
        ).scalars().all()
        for variant in variants:
            nodes.append(
                _Node(
                    "variant",
                    variant.id,
                    f"{product.name} · {variant.name}",
                    {
                        "product_name": product.name,
                        "variant_name": variant.name,
                        "sku": variant.sku,
                    },
                    [0],
                )
            )
        await self._save_plan(nodes)

    async def soft_delete_variant(self, variant_id: UUID, *, reason: str | None = None) -> None:
        variant = await self._entity(ProductVariant, variant_id)
        if variant is None:
            raise NotFoundError("Variant not found")
        product = await self._entity(Product, variant.product_id)
        if product is None:
            raise ConflictError("Restore the product before deleting its variant")
        await self._save_plan(
            [
                _Node(
                    "variant",
                    variant.id,
                    f"{product.name} · {variant.name}",
                    {
                        "product_name": product.name,
                        "variant_name": variant.name,
                        "sku": variant.sku,
                        "reason": reason,
                    },
                )
            ]
        )

    async def soft_delete_category(self, category_id: UUID, *, reason: str | None = None) -> None:
        category = await self._entity(Category, category_id)
        if category is None:
            raise NotFoundError("Category not found")
        await self._save_plan(
            [
                _Node(
                    "category",
                    category.id,
                    category.name,
                    {"category_name": category.name, "reason": reason},
                )
            ]
        )

    async def soft_delete_staff(self, user_id: UUID, *, reason: str | None = None) -> None:
        user = await self._entity(User, user_id)
        if user is None:
            raise NotFoundError("Staff member not found")
        if user_id == self.user_id:
            raise ValidationError("You cannot delete your own account")
        if user.is_superadmin:
            raise ValidationError("The superadmin account cannot be deleted")
        if user.role == "owner":
            owners = (
                await self.session.execute(
                    select(User.id).where(User.tenant_id == self.tenant_id, User.role == "owner")
                )
            ).scalars().all()
            if len(owners) <= 1:
                raise ValidationError("At least one owner must remain in the workspace")
        await self._save_plan(
            [
                _Node(
                    "staff",
                    user.id,
                    f"{user.full_name} · {user.email}",
                    {"staff_name": user.full_name, "email": user.email, "reason": reason},
                )
            ]
        )

    # ---- plan helpers -----------------------------------------------------------

    @staticmethod
    def _payment_label(receipt: str | None, customer_name: str | None) -> str:
        label = f"Payment {receipt or ''} · {customer_name or 'Unassigned'}"
        return label.replace("  ", " ").strip()

    async def _customer_name(self, customer_id: UUID | None) -> str | None:
        if customer_id is None:
            return None
        customer = await self._entity(Customer, customer_id)
        return customer.name if customer else None

    async def _add_order_nodes(
        self,
        nodes: list[_Node],
        order: Order,
        customer_name: str | None,
        root_deps: list[int],
        payment_indexes: dict[UUID, int],
        *,
        include_order: bool = True,
    ) -> None:
        if include_order:
            order_index = len(nodes)
            nodes.append(
                _Node(
                    "order",
                    order.id,
                    f"{order.order_ref} · {customer_name}" if customer_name else order.order_ref,
                    {
                        "order_ref": order.order_ref,
                        "customer_name": customer_name,
                        "ordered_at": _iso(order.created_at),
                    },
                    list(root_deps),
                )
            )
        else:
            matches = [
                index
                for index, node in enumerate(nodes)
                if node.entity_type == "order" and node.entity_id == order.id
            ]
            if not matches:
                raise ValidationError("Order recovery node is missing")
            order_index = matches[0]
        nodes.append(
            _Node(
                "khata",
                order.id,
                f"Khata · {order.order_ref}" + (f" · {customer_name}" if customer_name else ""),
                {"order_ref": order.order_ref, "customer_name": customer_name},
                [order_index],
            )
        )
        deliveries = (
            await self.session.execute(
                select(Delivery).where(
                    Delivery.tenant_id == self.tenant_id, Delivery.order_id == order.id
                )
            )
        ).scalars().all()
        for delivery in deliveries:
            nodes.append(
                _Node(
                    "delivered_order",
                    delivery.id,
                    f"Delivery · {order.order_ref}",
                    {
                        "order_ref": order.order_ref,
                        "delivered_at": _iso(delivery.delivered_at),
                        "order_status": order.status,
                    },
                    [order_index],
                )
            )
        payments = (
            await self.session.execute(
                select(LedgerEntry)
                .join(LedgerAllocation, LedgerAllocation.ledger_entry_id == LedgerEntry.id)
                .where(
                    LedgerEntry.tenant_id == self.tenant_id,
                    LedgerAllocation.order_id == order.id,
                )
            )
        ).scalars().unique().all()
        for payment in payments:
            allocations = (
                await self.session.execute(
                    select(LedgerAllocation.order_id).where(
                        LedgerAllocation.ledger_entry_id == payment.id
                    )
                )
            ).scalars().all()
            if any(oid != order.id for oid in allocations):
                continue
            if payment.id in payment_indexes:
                continue
            payment_indexes[payment.id] = len(nodes)
            nodes.append(
                _Node(
                    "payment",
                    payment.id,
                    self._payment_label(payment.receipt_number, customer_name),
                    {
                        "receipt_number": payment.receipt_number,
                        "customer_name": customer_name,
                        "order_ref": order.order_ref,
                        "amount": str(payment.amount),
                        "collected_at": _iso(payment.collected_at),
                    },
                    [order_index, *root_deps],
                )
            )

    async def _add_unallocated_payments(
        self,
        nodes: list[_Node],
        customer_id: UUID,
        root_deps: list[int],
        payment_indexes: dict[UUID, int],
    ) -> None:
        payments = (
            await self.session.execute(
                select(LedgerEntry).where(
                    LedgerEntry.tenant_id == self.tenant_id,
                    LedgerEntry.customer_id == customer_id,
                )
            )
        ).scalars().all()
        for payment in payments:
            if payment.id in payment_indexes:
                continue
            has_allocation = (
                await self.session.execute(
                    select(LedgerAllocation.id)
                    .where(LedgerAllocation.ledger_entry_id == payment.id)
                    .limit(1)
                )
            ).scalar_one_or_none()
            if has_allocation:
                continue
            payment_indexes[payment.id] = len(nodes)
            nodes.append(
                _Node(
                    "payment",
                    payment.id,
                    self._payment_label(
                        payment.receipt_number, self._detail_customer(nodes)
                    ),
                    {
                        "receipt_number": payment.receipt_number,
                        "amount": str(payment.amount),
                        "collected_at": _iso(payment.collected_at),
                    },
                    list(root_deps),
                )
            )

    @staticmethod
    def _detail_customer(nodes: list[_Node]) -> str:
        return str(nodes[0].detail.get("customer_name") or "Unassigned")

    async def _save_plan(self, nodes: list[_Node]) -> None:
        if not nodes:
            return
        unique_nodes: list[_Node] = []
        indexes: dict[tuple[str, UUID], int] = {}
        remap: dict[int, int] = {}
        for index, node in enumerate(nodes):
            key = (node.entity_type, node.entity_id)
            if key in indexes:
                remap[index] = indexes[key]
                unique_nodes[indexes[key]].detail.update(node.detail)
                continue
            indexes[key] = len(unique_nodes)
            remap[index] = indexes[key]
            unique_nodes.append(node)
        for new_index, node in enumerate(unique_nodes):
            node.depends = list(
                dict.fromkeys(
                    remap[index] for index in node.depends if remap[index] != new_index
                )
            )

        now = _now()
        batch_id = uuid4()
        items: list[RecoveryItem] = []
        for node in unique_nodes:
            item = RecoveryItem(
                id=uuid4(),
                tenant_id=self.tenant_id,
                entity_type=node.entity_type,
                entity_id=node.entity_id,
                label=node.label[:255],
                detail=node.detail,
                depends_on=[str(items[index].id) for index in node.depends],
                batch_id=batch_id,
                state="trashed",
                deleted_at=now,
                deleted_by=self.user_id,
            )
            self.session.add(item)
            items.append(item)
        await self.session.flush()

        for node in unique_nodes:
            entity = await self._entity(node.model, node.entity_id)
            if entity is None:
                continue
            entity.deleted_at = now
            entity.deleted_by = self.user_id
            entity.delete_batch_id = batch_id
        await self.session.flush()

    # ---- restore / permanent delete --------------------------------------------

    async def restore(self, item_id: UUID) -> RecoveryItemRead:
        await self.resolve_admin()
        item = await self._item(item_id)
        self._check_window(item)
        graph = await self._graph()
        blocked = self._blocked_by(item, graph)
        if blocked:
            raise ConflictError(f"Restore {blocked} first before restoring this record")
        subtree, depths = await self._subtree(item_id, graph)
        ordered = sorted(subtree, key=lambda row: depths[row.id])
        now = _now()
        for row in ordered:
            entity = await self._entity(ENTITY_MODELS[row.entity_type], row.entity_id)
            if entity is None:
                continue
            await self._check_restore_conflicts(entity)
        for row in ordered:
            entity = await self._entity(ENTITY_MODELS[row.entity_type], row.entity_id)
            if entity is not None:
                entity.deleted_at = None
                entity.deleted_by = None
                entity.delete_batch_id = None
                await self._after_restore(entity)
            row.state = "restored"
            row.restored_at = now
        await self.session.flush()
        return self._to_read(item, await self._graph(), admin=self.is_admin)

    async def permanently_delete(self, item_id: UUID) -> None:
        await self.resolve_admin()
        item = await self._item(item_id)
        self._check_window(item)
        graph = await self._graph()
        subtree, depths = await self._subtree(item_id, graph)
        ordered = sorted(subtree, key=lambda row: depths[row.id], reverse=True)
        now = _now()
        removed: set[tuple[type, UUID]] = set()
        for row in ordered:
            key = (ENTITY_MODELS[row.entity_type], row.entity_id)
            if key in removed:
                continue
            await self._delete_entity(row)
            removed.add(key)
            row.state = "purged"
            row.purged_at = now
        await self.session.flush()

    async def _after_restore(self, entity: Any) -> None:
        if isinstance(entity, Delivery) and entity.status in {
            "assigned",
            "in_delivery",
            "delivered",
        }:
            order = await self._entity(Order, entity.order_id)
            if order is not None and order.status not in {"cancelled", "failed"}:
                order.status = entity.status

    async def _delete_entity(self, item: RecoveryItem) -> None:
        model = ENTITY_MODELS[item.entity_type]
        entity = await self._entity(model, item.entity_id)
        if entity is None:
            return
        if isinstance(entity, Order):
            from app.modules.orders.service import OrderService

            await OrderService(self.session, self.tenant_id, self.user_id).hard_delete(entity)
            return
        if isinstance(entity, LedgerEntry):
            from app.modules.khata.service import KhataService

            service = KhataService(self.session, self.tenant_id, self.user_id)
            if entity.status == "active":
                entity.deleted_at = None
                await self.session.flush()
                await service.void_payment_for_deletion(
                    entity.id, str((item.detail or {}).get("order_ref") or "recovery")
                )
        if isinstance(entity, Delivery):
            from app.modules.accounting.voiding import void_linked_accounting

            await void_linked_accounting(
                self.session,
                self.tenant_id,
                self.user_id,
                delivery_id=entity.id,
            )
            order = await self._entity(Order, entity.order_id)
            if order is not None and order.status in {"delivered", "in_delivery", "assigned"}:
                order.status = "ready"
        await self.session.delete(entity)
        await self.session.flush()

    async def _check_restore_conflicts(self, entity: Any) -> None:
        checks: list[tuple[Any, str, Any, str]] = []
        if isinstance(entity, Customer):
            checks = [
                (Customer.email, "email", entity.email, "email"),
                (Customer.pan_no, "pan_no", entity.pan_no, "PAN"),
            ]
        elif isinstance(entity, Product):
            checks = [
                (Product.sku, "sku", entity.sku, "SKU"),
                (Product.slug, "slug", entity.slug, "slug"),
            ]
        elif isinstance(entity, ProductVariant):
            checks = [(ProductVariant.sku, "sku", entity.sku, "variant SKU")]
        elif isinstance(entity, Category):
            checks = [(Category.slug, "slug", entity.slug, "slug")]
        elif isinstance(entity, User):
            checks = [(User.email, "email", entity.email, "email")]
        for column, _, value, label in checks:
            if not value:
                continue
            found = (
                await self.session.execute(
                    select(column).where(
                        entity.__class__.tenant_id == self.tenant_id,
                        column == value,
                        entity.__class__.id != entity.id,
                    )
                )
            ).scalar_one_or_none()
            if found is not None:
                raise ConflictError(
                    f"Cannot restore: another active record already uses this {label}"
                )

    def _check_window(self, item: RecoveryItem) -> None:
        days = ADMIN_RECOVERY_DAYS if self.is_admin else USER_RECOVERY_DAYS
        expires = item.deleted_at + timedelta(days=days)
        if _now() > expires:
            raise ValidationError(
                f"Recovery window closed. This record is kept for {ADMIN_RECOVERY_DAYS} days "
                "in the backend admin only."
            )

    # ---- graph primitives -------------------------------------------------------

    async def _item(self, item_id: UUID) -> RecoveryItem:
        item = (
            await self.session.execute(
                select(RecoveryItem).where(
                    RecoveryItem.id == item_id, RecoveryItem.tenant_id == self.tenant_id
                )
            )
        ).scalar_one_or_none()
        if item is None:
            raise NotFoundError("Recovery item not found")
        if item.state != "trashed":
            raise ConflictError("This record is no longer in recovery")
        return item

    async def _entity(self, model: type, entity_id: UUID | None) -> Any:
        if entity_id is None:
            return None
        result = await self.session.execute(
            select(model)
            .where(model.tenant_id == self.tenant_id, model.id == entity_id)
            .execution_options(include_deleted=True)
        )
        return result.scalar_one_or_none()

    async def _graph(self) -> dict[str, RecoveryItem]:
        rows = (
            await self.session.execute(
                select(RecoveryItem).where(
                    RecoveryItem.tenant_id == self.tenant_id,
                    RecoveryItem.state == "trashed",
                )
            )
        ).scalars().all()
        return {str(row.id): row for row in rows}

    @staticmethod
    def _blocked_by(item: RecoveryItem, graph: dict[str, RecoveryItem]) -> str | None:
        for dep_id in item.depends_on:
            parent = graph.get(dep_id)
            if parent is None:
                return "its parent (permanently deleted)"
            if parent.state == "trashed":
                return parent.label
        return None

    async def _subtree(
        self, root_id: UUID, graph: dict[str, RecoveryItem]
    ) -> tuple[list[RecoveryItem], dict[UUID, int]]:
        children: dict[str, list[RecoveryItem]] = {}
        for row in graph.values():
            for parent_id in row.depends_on:
                children.setdefault(parent_id, []).append(row)
        root = graph.get(str(root_id))
        if root is None:
            raise NotFoundError("Recovery item not found")
        collected: list[RecoveryItem] = [root]
        depths: dict[UUID, int] = {root.id: 0}
        queue = [root]
        while queue:
            current = queue.pop(0)
            for child in children.get(str(current.id), []):
                if child.id in depths:
                    continue
                depths[child.id] = depths[current.id] + 1
                collected.append(child)
                queue.append(child)
        return collected, depths
