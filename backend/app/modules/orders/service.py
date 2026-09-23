from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customer_prices.service import resolve_price
from app.modules.customers.models import Customer
from app.modules.orders.models import Order, OrderItem
from app.modules.orders.repository import OrderRepository
from app.modules.orders.schemas import (
    OrderBulkStatusResult,
    OrderBulkStatusSkip,
    OrderCreate,
    OrderItemCreate,
    OrderRead,
    OrderUpdate,
)
from app.modules.products.models import InventoryMovement, Product, ProductVariant
from app.modules.products.stock import StockChange, apply_stock_changes
from app.shared.exceptions import ConflictError, ValidationError

# The order's own workflow only runs draft -> confirmed -> ready. Any status
# after that is driven by the linked delivery (assigned -> picked_up ->
# in_transit -> delivered/failed) and set by the delivery service.
VALID_STATUSES = {
    "draft",
    "confirmed",
    "ready",
    "in_delivery",
    "assigned",
    "picked_up",
    "in_transit",
    "delivered",
    "failed",
    "cancelled",
}
VALID_PAYMENT_STATUSES = {"unpaid", "partial", "paid"}
STATUS_TRANSITIONS = {
    "draft": {"confirmed", "cancelled"},
    "confirmed": {"ready", "cancelled"},
    "ready": {"cancelled"},
    "in_delivery": set(),
    "assigned": set(),
    "picked_up": set(),
    "in_transit": set(),
    "delivered": set(),
    "failed": set(),
    "cancelled": set(),
}


class OrderService:
    def __init__(self, session: AsyncSession, tenant_id: UUID, user_id: UUID | None = None):
        self.session = session
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.repo = OrderRepository(session, tenant_id)

    def _notify_service(self):
        from app.modules.notifications.service import NotificationService

        return NotificationService(self.session, self.tenant_id)

    async def list(
        self,
        limit: int,
        offset: int,
        status: str | None = None,
        customer_id: UUID | None = None,
        route_id: UUID | None = None,
    ) -> list[OrderRead]:
        orders = await self.repo.list(limit, offset, status, customer_id, route_id)
        return [OrderRead.model_validate(o) for o in orders]

    async def get(self, order_id: UUID) -> OrderRead:
        order = await self.repo.get(order_id)
        return OrderRead.model_validate(order)

    async def _validate_refs(self, data: OrderCreate) -> None:
        if data.customer_id:
            ok = (
                await self.session.execute(
                    select(Customer.id).where(
                        Customer.tenant_id == self.tenant_id,
                        Customer.id == data.customer_id,
                    )
                )
            ).scalar_one_or_none()
            if not ok:
                raise ValidationError("customer_id does not belong to this tenant")
        for item in data.items:
            product = (
                await self.session.execute(
                    select(Product).where(
                        Product.tenant_id == self.tenant_id,
                        Product.id == item.product_id,
                    )
                )
            ).scalar_one_or_none()
            if not product:
                raise ValidationError(f"product_id {item.product_id} not found")
            if item.variant_id:
                variant = (
                    await self.session.execute(
                        select(ProductVariant).where(
                            ProductVariant.tenant_id == self.tenant_id,
                            ProductVariant.id == item.variant_id,
                            ProductVariant.product_id == item.product_id,
                        )
                    )
                ).scalar_one_or_none()
                if not variant:
                    raise ValidationError(f"variant_id {item.variant_id} not found on this product")

    async def create(self, data: OrderCreate) -> OrderRead:
        order = await self._create(data)
        return OrderRead.model_validate(order)

    async def reorder(self, order_id: UUID) -> OrderRead:
        """Re-order a failed/cancelled order.

        Creates a fresh draft order copying the original's customer, delivery
        details, notes and line items, and links it back as a reorder (#N) so
        the original's record — and the whole cancellation history of the chain
        — stays intact. Stock is reserved again like any new order.
        """
        source = await self.repo.get(order_id)
        if source.status not in {"failed", "cancelled"}:
            raise ConflictError(
                f"Only failed or cancelled orders can be re-ordered (got '{source.status}')"
            )
        data = OrderCreate(
            customer_id=source.customer_id,
            delivery_address=source.delivery_address,
            delivery_lat=source.delivery_lat,
            delivery_lng=source.delivery_lng,
            notes=source.notes,
            items=[
                OrderItemCreate(
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    quantity=item.quantity,
                )
                for item in source.items
            ],
        )
        attempt = (source.reorder_attempt or 0) + 1
        order = await self._create(data, reorder_of_id=source.id, reorder_attempt=attempt)
        return OrderRead.model_validate(order)

    async def _create(
        self,
        data: OrderCreate,
        reorder_of_id: UUID | None = None,
        reorder_attempt: int | None = None,
    ) -> Order:
        await self._validate_refs(data)
        customer = None
        if data.customer_id:
            customer = (
                await self.session.execute(
                    select(Customer).where(
                        Customer.tenant_id == self.tenant_id,
                        Customer.id == data.customer_id,
                    )
                )
            ).scalar_one_or_none()
        order_ref = await self.repo.next_order_ref()
        delivery_address = data.delivery_address
        delivery_lat = data.delivery_lat
        delivery_lng = data.delivery_lng
        if customer is not None and delivery_address is None:
            delivery_address = customer.address
        if customer is not None and delivery_lat is None:
            delivery_lat = customer.latitude
        if customer is not None and delivery_lng is None:
            delivery_lng = customer.longitude
        order = Order(
            tenant_id=self.tenant_id,
            order_ref=order_ref,
            customer_id=data.customer_id,
            route_id=customer.route_id if customer is not None else None,
            delivery_address=delivery_address,
            delivery_lat=delivery_lat,
            delivery_lng=delivery_lng,
            notes=data.notes,
            created_by=self.user_id,
            reorder_of_id=reorder_of_id,
            reorder_attempt=reorder_attempt,
        )
        total = Decimal("0")
        items: list[OrderItem] = []
        stock_changes: list[StockChange] = []
        for item in data.items:
            if not item.variant_id:
                raise ValidationError(
                    "A variant must be selected to resolve a price on an order line"
                )
            if item.quantity != item.quantity.to_integral_value():
                raise ValidationError("Line quantities must be whole numbers")
            unit_price, _currency = await resolve_price(
                self.session, self.tenant_id, data.customer_id, item.variant_id
            )
            amount = (item.quantity * unit_price).quantize(Decimal("0.01"))
            total += amount
            product_name = ""
            variant_name = None
            product = (
                await self.session.execute(
                    select(Product).where(Product.id == item.product_id)
                )
            ).scalar_one()
            product_name = product.name
            if item.variant_id:
                variant = (
                    await self.session.execute(
                        select(ProductVariant).where(ProductVariant.id == item.variant_id)
                    )
                ).scalar_one_or_none()
                if variant:
                    variant_name = variant.name
            items.append(
                OrderItem(
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    product_name=product_name,
                    variant_name=variant_name,
                    unit=variant.unit if item.variant_id else None,
                    quantity=item.quantity,
                    unit_price=unit_price,
                    amount=amount,
                )
            )
            stock_changes.append(
                StockChange(
                    variant_id=item.variant_id,
                    product_id=item.product_id,
                    product_name=product_name,
                    variant_name=variant_name,
                    delta=-int(item.quantity),
                )
            )
        order.total_amount = total
        movements = await apply_stock_changes(
            self.session, self.tenant_id, stock_changes, reason="order"
        )
        created = await self.repo.create(order, items)
        for movement in movements:
            movement.order_id = created.id
        return created

    async def update(self, order_id: UUID, data: OrderUpdate) -> OrderRead:
        order = await self.repo.get(order_id)
        if order.status == "failed":
            raise ConflictError("Failed orders are locked and cannot be updated")
        updates = data.model_dump(exclude_unset=True)
        new_status = updates.get("status")
        is_cancelling = order.status != "cancelled" and new_status == "cancelled"
        if new_status is not None:
            if new_status not in VALID_STATUSES:
                raise ValidationError(f"Invalid status: {new_status}")
            allowed = STATUS_TRANSITIONS.get(order.status, set())
            if new_status not in allowed:
                raise ConflictError(
                    f"Cannot transition from '{order.status}' to '{new_status}'"
                )
        # `payment_status`/`amount_paid` are owned by the khata ledger and are
        # recomputed transactionally on each payment record/void — they can no
        # longer be set through this endpoint. OrderUpdate omits the field, so
        # any leftover value arriving here is dropped before the loop below.
        new_items_raw = updates.pop("items", None)
        for field, value in updates.items():
            setattr(order, field, value)
        # The order's route rides along with its customer; when the customer is
        # switched, re-inherit the route from the new customer.
        if "customer_id" in updates:
            if order.customer_id:
                customer = (
                    await self.session.execute(
                        select(Customer).where(Customer.id == order.customer_id)
                    )
                ).scalar_one_or_none()
                order.route_id = customer.route_id if customer else None
            else:
                order.route_id = None
        if new_items_raw is not None:
            new_items = [OrderItemCreate(**it) for it in new_items_raw]
            await self._replace_items(order, new_items)
        # A cancelled order releases its reserved stock back to the warehouse.
        if is_cancelling:
            held, meta = await self._held_stock(order)
            await apply_stock_changes(
                self.session,
                self.tenant_id,
                [
                    entry._replace(delta=held[vid])
                    for vid, entry in meta.items()
                    if held[vid] != 0
                ],
                reason="cancelled",
                order_id=order.id,
            )
        # A ready order is sent straight into the delivery pipeline.
        delivery_created = False
        if new_status == "ready" and order.status == "ready":
            delivery_created = await self._auto_create_delivery(order.id)
        updated = await self.repo.update(order)
        read = OrderRead.model_validate(updated)
        read.delivery_created = delivery_created
        if new_status in ("confirmed", "ready", "cancelled"):
            await self._notify_service().order_status(
                order.id, order.order_ref, new_status,
                extra="A delivery has been created for it." if new_status == "ready" and delivery_created else None,
            )
        return read

    async def _held_stock(self, order: Order) -> tuple[dict[UUID, int], dict[UUID, StockChange]]:
        """Stock currently reserved by an order's inventory movements.

        Returns (units_held_by_variant, stock_change_template_by_variant).
        Orders created before stock tracking are not deducted anywhere, so
        they hold nothing and editing them never returns phantom units.
        """
        movements = (
            await self.session.execute(
                select(InventoryMovement).where(InventoryMovement.order_id == order.id)
            )
        ).scalars().all()
        held: dict[UUID, int] = {}
        meta: dict[UUID, StockChange] = {}
        for movement in movements:
            held[movement.variant_id] = held.get(movement.variant_id, 0) - movement.quantity
            meta[movement.variant_id] = StockChange(
                variant_id=movement.variant_id,
                product_id=movement.product_id,
                product_name=movement.product_name,
                variant_name=movement.variant_name,
                delta=0,
            )
        return held, meta

    async def _replace_items(self, order: Order, items: list[OrderItemCreate]) -> None:
        """Replace the order's line items and recompute its total.

        Stock is rebalanced against what the order actually holds: whatever it
        currently reserves is returned to the warehouse and the new quantities
        are reserved instead, so editing an order never leaks or invents units.
        """
        if not items:
            raise ValidationError("An order must have at least one line item")
        new_by_variant: dict[UUID, int] = {}
        new_meta: dict[UUID, StockChange] = {}
        for item in items:
            if not item.variant_id:
                raise ValidationError(
                    "A variant must be selected to resolve a price on an order line"
                )
            if item.quantity != item.quantity.to_integral_value():
                raise ValidationError("Line quantities must be whole numbers")
            product = (
                await self.session.execute(
                    select(Product).where(
                        Product.tenant_id == self.tenant_id,
                        Product.id == item.product_id,
                    )
                )
            ).scalar_one_or_none()
            if not product:
                raise ValidationError(f"product_id {item.product_id} not found")
            variant = (
                await self.session.execute(
                    select(ProductVariant).where(
                        ProductVariant.tenant_id == self.tenant_id,
                        ProductVariant.id == item.variant_id,
                        ProductVariant.product_id == item.product_id,
                    )
                )
            ).scalar_one_or_none()
            if not variant:
                raise ValidationError(
                    f"variant_id {item.variant_id} not found on this product"
                )
            new_by_variant[item.variant_id] = (
                new_by_variant.get(item.variant_id, 0) + int(item.quantity)
            )
            new_meta[item.variant_id] = StockChange(
                variant_id=item.variant_id,
                product_id=item.product_id,
                product_name=product.name,
                variant_name=variant.name,
                delta=0,
            )
        total = Decimal("0")
        new_order_items: list[OrderItem] = []
        for item in items:
            unit_price, _currency = await resolve_price(
                self.session, self.tenant_id, order.customer_id, item.variant_id
            )
            amount = (item.quantity * unit_price).quantize(Decimal("0.01"))
            total += amount
            product = (
                await self.session.execute(
                    select(Product).where(Product.id == item.product_id)
                )
            ).scalar_one()
            variant = None
            if item.variant_id:
                variant = (
                    await self.session.execute(
                        select(ProductVariant).where(ProductVariant.id == item.variant_id)
                    )
                ).scalar_one_or_none()
            new_order_items.append(
                OrderItem(
                    tenant_id=self.tenant_id,
                    order_id=order.id,
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    product_name=product.name,
                    variant_name=variant.name if variant else None,
                    unit=variant.unit if variant else None,
                    quantity=item.quantity,
                    unit_price=unit_price,
                    amount=amount,
                )
            )
        held, meta = await self._held_stock(order)
        changes: list[StockChange] = []
        for variant_id in set(meta) | set(new_meta):
            delta = held.get(variant_id, 0) - new_by_variant.get(variant_id, 0)
            if delta == 0:
                continue
            entry = meta.get(variant_id) or new_meta[variant_id]
            changes.append(entry._replace(delta=delta))
        await apply_stock_changes(
            self.session, self.tenant_id, changes, reason="order", order_id=order.id
        )
        order.items = new_order_items
        order.total_amount = total

    async def _auto_create_delivery(self, order_id: UUID) -> bool:
        """Idempotently create the delivery record for a ready order."""
        from app.modules.deliveries.service import DeliveryService

        delivery_service = DeliveryService(self.session, self.tenant_id)
        try:
            await delivery_service.create_for_order(order_id)
            return True
        except ConflictError:
            # A delivery already exists for this order; leave it untouched.
            return False

    async def bulk_update_status(
        self, order_ids: list[UUID], new_status: str
    ) -> OrderBulkStatusResult:
        """Apply a status change to many orders at once.

        Only valid transitions are applied (matching the single-order rules):
        cancelled orders release reserved stock, and orders becoming "ready"
        are pushed into the delivery pipeline. Orders that cannot transition
        are reported in the result instead of failing the whole batch.
        """
        if new_status not in VALID_STATUSES:
            raise ValidationError(f"Invalid status: {new_status}")
        orders = await self.repo.get_many(order_ids)
        updated = 0
        skipped: list[OrderBulkStatusSkip] = []
        for order in orders:
            if order.status == "failed":
                skipped.append(
                    OrderBulkStatusSkip(
                        order_id=order.id, reason="Failed orders are locked"
                    )
                )
                continue
            allowed = STATUS_TRANSITIONS.get(order.status, set())
            if new_status not in allowed:
                skipped.append(
                    OrderBulkStatusSkip(
                        order_id=order.id,
                        reason=f"Cannot transition from '{order.status}' to '{new_status}'",
                    )
                )
                continue
            if new_status == "cancelled":
                held, meta = await self._held_stock(order)
                if held:
                    await apply_stock_changes(
                        self.session,
                        self.tenant_id,
                        [
                            entry._replace(delta=held[vid])
                            for vid, entry in meta.items()
                            if held[vid] != 0
                        ],
                        reason="cancelled",
                        order_id=order.id,
                    )
            order.status = new_status
            if new_status == "ready":
                await self._auto_create_delivery(order.id)
            if new_status in ("confirmed", "ready", "cancelled"):
                await self._notify_service().order_status(
                    order.id, order.order_ref, new_status
                )
            updated += 1
        await self.session.flush()
        return OrderBulkStatusResult(updated=updated, skipped=skipped)

    async def delete(self, order_id: UUID) -> None:
        order = await self.repo.get(order_id)
        if order.status != "draft":
            raise ConflictError("Only draft orders can be deleted")
        held, meta = await self._held_stock(order)
        await apply_stock_changes(
            self.session,
            self.tenant_id,
            [
                entry._replace(delta=held[vid])
                for vid, entry in meta.items()
                if held[vid] != 0
            ],
            reason="cancelled",
            order_id=order.id,
        )
        await self.repo.delete(order)
