"""Stock reservation helpers shared by the orders and products modules.

Stock lives on ``ProductVariant.stock_quantity``. Every change is applied
inside the caller's transaction with the variant row locked (``FOR UPDATE``)
so concurrent order creation can never oversell, and each change is mirrored
into an ``InventoryMovement`` audit record.

A ``StockChange.delta`` is the signed number of units to apply: negative
units leave the warehouse (an order), positive units come back (order
cancelled, edited, or deleted).
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import NamedTuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.products.models import InventoryMovement, ProductVariant
from app.shared.exceptions import ConflictError


class StockChange(NamedTuple):
    variant_id: UUID
    product_id: UUID
    product_name: str
    variant_name: str | None
    delta: int
    unit_cost: Decimal | None = None


async def apply_stock_changes(
    session: AsyncSession,
    tenant_id: UUID,
    changes: list[StockChange],
    reason: str = "order",
    order_id: UUID | None = None,
    transaction_id: UUID | None = None,
) -> list[InventoryMovement]:
    """Lock the affected variant rows, validate they can absorb the changes,
    apply them, and record matching inventory movements.

    Validation only applies to negative deltas: a variant can never go below
    zero. If any line would oversell, a :class:`ConflictError` is raised and
    no changes are applied (the caller's transaction rolls back as a whole).
    """
    if not changes:
        return []

    variant_ids = {change.variant_id for change in changes}
    result = await session.execute(
        select(ProductVariant).where(
            ProductVariant.tenant_id == tenant_id,
            ProductVariant.id.in_(variant_ids),
        ).with_for_update()
    )
    variants = {v.id: v for v in result.scalars().all()}

    for change in changes:
        variant = variants.get(change.variant_id)
        if variant is None:
            raise ConflictError(
                f"Variant {change.variant_id} is not available for ordering"
            )
        if change.delta < 0 and -change.delta > variant.stock_quantity:
            raise ConflictError(
                f"Insufficient stock for {change.variant_name or 'this product'}: "
                f"only {variant.stock_quantity} available, {-change.delta} requested"
            )

    movements: list[InventoryMovement] = []
    for change in changes:
        variant = variants[change.variant_id]
        old_quantity = variant.stock_quantity
        old_average = Decimal(variant.average_cost or 0)
        if change.delta > 0:
            incoming = (
                Decimal(change.unit_cost)
                if change.unit_cost is not None
                else old_average
            )
            new_quantity = old_quantity + change.delta
            if incoming > 0:
                if old_quantity <= 0:
                    variant.average_cost = incoming.quantize(Decimal("0.0001"))
                else:
                    variant.average_cost = (
                        (old_average * old_quantity + incoming * change.delta)
                        / new_quantity
                    ).quantize(Decimal("0.0001"))
            unit_cost = incoming or Decimal(variant.average_cost or 0)
        else:
            unit_cost = (
                Decimal(change.unit_cost)
                if change.unit_cost is not None
                else old_average
            )

        variant.stock_quantity += change.delta
        movement = InventoryMovement(
            tenant_id=tenant_id,
            variant_id=variant.id,
            product_id=change.product_id,
            product_name=change.product_name,
            variant_name=change.variant_name,
            quantity=change.delta,
            unit_cost=unit_cost.quantize(Decimal("0.0001")),
            total_cost=(unit_cost * change.delta).quantize(Decimal("0.01")),
            reason=reason,
            order_id=order_id,
            transaction_id=transaction_id,
        )
        session.add(movement)
        movements.append(movement)

    # Surface low-stock alerts to the back office right after a change pushed
    # any variant to (or below) its threshold. Best-effort: never let a stock
    # operation fail because notifications broke.
    try:
        from app.modules.notifications.service import NotificationService

        notification_service = NotificationService(session, tenant_id)
        await notification_service.sync_low_stock(
            [variants[change.variant_id] for change in changes]
        )
    except Exception:  # noqa: BLE001
        logging.getLogger("factory.notifications").exception(
            "Failed to create low-stock notifications"
        )
    return movements