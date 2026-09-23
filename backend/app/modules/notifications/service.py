from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customers.models import Customer
from app.modules.notifications import push
from app.modules.notifications.models import Notification, PushSubscription
from app.modules.notifications.repository import NotificationRepository
from app.modules.notifications.schemas import (
    NotificationRead,
    ReadAllResult,
    UnreadCountRead,
)
from app.modules.orders.models import Order
from app.modules.users.models import User

logger = logging.getLogger("factory.notifications")


class NotificationService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = NotificationRepository(session, tenant_id)

    # ------------------------------------------------------------------
    # Reading
    # ------------------------------------------------------------------

    async def _current_role(self, user_id: UUID) -> str:
        user = (
            await self.session.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
        return user.role if user else "viewer"

    async def list_for_user(self, user_id: UUID, limit: int, offset: int) -> list[NotificationRead]:
        role = await self._current_role(user_id)
        rows = await self.repo.list_for_user(user_id, role, limit, offset)
        return [NotificationRead.model_validate(n) for n in rows]

    async def unread_count(self, user_id: UUID) -> UnreadCountRead:
        role = await self._current_role(user_id)
        return UnreadCountRead(count=await self.repo.unread_count(user_id, role))

    async def mark_read(self, notification_id: UUID, user_id: UUID) -> NotificationRead:
        role = await self._current_role(user_id)
        notification = await self.repo.get_visible(notification_id, user_id, role)
        if notification.read_at is None:
            from datetime import UTC, datetime

            notification.read_at = datetime.now(UTC)
            notification = await self.repo.mark_read(notification)
        return NotificationRead.model_validate(notification)

    async def mark_all_read(self, user_id: UUID) -> ReadAllResult:
        role = await self._current_role(user_id)
        return ReadAllResult(updated=await self.repo.mark_all_read(user_id, role))

    # ------------------------------------------------------------------
    # Writing
    # ------------------------------------------------------------------

    async def notify(
        self,
        *,
        category: str,
        title: str,
        message: str | None = None,
        link: str | None = None,
        data: dict[str, Any] | None = None,
        recipient_user_id: UUID | None = None,
        recipient_roles: list[str] | None = None,
        dedupe_key: str | None = None,
        urgency: str = "normal",
    ) -> Notification | None:
        """Create a notification (and optionally push it) in the caller's txn.

        When ``dedupe_key`` is set and an identical alert is still unread, the
        new record is skipped so repeated events (low-stock wiggles, recurring
        dashboard opens) never spam the bell.
        """
        if dedupe_key:
            existing = (
                await self.session.execute(
                    select(Notification.id).where(
                        Notification.tenant_id == self.tenant_id,
                        Notification.dedupe_key == dedupe_key,
                        Notification.read_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if existing is not None:
                return None

        notification = Notification(
            tenant_id=self.tenant_id,
            recipient_user_id=recipient_user_id,
            recipient_roles=recipient_roles,
            category=category,
            title=title,
            message=message,
            link=link,
            data=data,
            dedupe_key=dedupe_key,
        )
        self.session.add(notification)
        await self.session.flush()

        try:
            if recipient_user_id is not None:
                await push.push_to_users(
                    self.session,
                    self.tenant_id,
                    [recipient_user_id],
                    title,
                    message or "",
                    urgency,
                    link,
                )
            elif recipient_roles:
                ids = await self._user_ids_for_roles(recipient_roles)
                await push.push_to_users(
                    self.session,
                    self.tenant_id,
                    ids,
                    title,
                    message or "",
                    urgency,
                    link,
                )
            else:
                ids = await self._tenant_user_ids()
                await push.push_to_users(
                    self.session,
                    self.tenant_id,
                    ids,
                    title,
                    message or "",
                    urgency,
                    link,
                )
        except Exception as exc:  # noqa: BLE001 - push must never break the business op
            logger.warning("Push delivery failed: %s", exc)
        return notification

    async def _user_ids_for_roles(self, roles: list[str]) -> list[UUID]:
        rows = (
            await self.session.execute(
                select(User.id).where(
                    User.tenant_id == self.tenant_id,
                    User.status == "active",
                    User.role.in_(roles),
                )
            )
        ).scalars().all()
        return list(rows)

    async def _tenant_user_ids(self) -> list[UUID]:
        rows = (
            await self.session.execute(
                select(User.id).where(
                    User.tenant_id == self.tenant_id,
                    User.status == "active",
                )
            )
        ).scalars().all()
        return list(rows)

    # ------------------------------------------------------------------
    # Generated alerts
    # ------------------------------------------------------------------

    async def sync_low_stock(self, variants) -> None:
        """Create low-stock alerts for variants at/below their threshold.

        Called after any stock-affecting change. Only alerts for variants
        without an outstanding (unread) alert are created.
        """
        for variant in variants:
            if variant.stock_quantity > variant.low_stock_threshold:
                continue
            from app.modules.products.models import Product

            product = (
                await self.session.execute(
                    select(Product).where(Product.id == variant.product_id)
                )
            ).scalar_one_or_none()
            product_name = product.name if product else variant.name
            variant_part = (
                f" ({variant.name})"
                if variant.name and variant.name != product_name
                else ""
            )
            await self.notify(
                category="stock",
                title=f"Low stock: {product_name}",
                message=(
                    f"{product_name}{variant_part} is running low "
                    f"({variant.stock_quantity} left, threshold "
                    f"{variant.low_stock_threshold})."
                ),
                link=f"/products/{variant.product_id}",
                data={
                    "severity": "warning",
                    "product_id": str(variant.product_id),
                    "variant_id": str(variant.id),
                    "stock": variant.stock_quantity,
                    "threshold": variant.low_stock_threshold,
                },
                recipient_roles=["owner", "admin", "manager"],
                dedupe_key=f"stock:{variant.id}",
                urgency="normal",
            )

    async def _order_customer_name(self, order_id: UUID) -> str | None:
        """Resolve the human-readable customer name behind an order."""
        row = (
            await self.session.execute(
                select(Customer.name)
                .select_from(Order)
                .join(Customer, Customer.id == Order.customer_id)
                .where(Order.id == order_id)
            )
        ).scalar_one_or_none()
        return str(row) if row else None

    async def order_status(
        self,
        order_id: UUID,
        order_ref: str,
        status: str,
        extra: str | None = None,
    ) -> None:
        """Broadcast an order-progress update to the back office."""
        labels = {
            "confirmed": "Order confirmed",
            "ready": "Order ready for delivery",
            "cancelled": "Order cancelled",
        }
        title = labels.get(status, f"Order {status.replace('_', ' ')}")
        customer_name = await self._order_customer_name(order_id)
        who = f" for {customer_name}" if customer_name else ""
        message = f"Order {order_ref}{who} is now {status.replace('_', ' ')}."
        if extra:
            message = f"{message} {extra}"
        await self.notify(
            category="order",
            title=title,
            message=message,
            link=f"/orders/{order_id}",
            data={"order_id": str(order_id), "order_ref": order_ref, "status": status},
            recipient_roles=["owner", "admin", "manager"],
            urgency="normal",
        )

    async def delivery_status(
        self,
        order_id: UUID,
        order_ref: str,
        status: str,
        message: str | None = None,
        recipient_user_id: UUID | None = None,
        recipient_roles: list[str] | None = None,
        urgency: str = "normal",
        link: str | None = None,
    ) -> None:
        customer_name = await self._order_customer_name(order_id)
        if message is None:
            who = f" of {customer_name}" if customer_name else ""
            message = f"Order {order_ref}{who} delivery is {status.replace('_', ' ')}."
        await self.notify(
            category="delivery",
            title=f"Delivery {status.replace('_', ' ')}",
            message=message,
            link=link or f"/orders/{order_id}",
            data={"order_id": str(order_id), "order_ref": order_ref, "status": status},
            recipient_user_id=recipient_user_id,
            recipient_roles=recipient_roles,
            urgency=urgency,
        )

    async def payment_received(self, customer_id: UUID, amount: str, order_refs: list[str]) -> None:
        customer = (
            await self.session.execute(
                select(Customer.name).where(Customer.id == customer_id)
            )
        ).scalar_one_or_none()
        customer_name = str(customer) if customer else None
        who = f" from {customer_name}" if customer_name else ""
        await self.notify(
            category="payment",
            title="Payment received",
            message=f"{amount} received{who}"
            + (f" for {', '.join(order_refs[:3])}" if order_refs else "")
            + ".",
            link=f"/khata/{customer_id}",
            data={"customer_id": str(customer_id), "amount": amount},
            recipient_roles=["owner", "admin", "manager", "accountant"],
            urgency="high",
        )

    async def prediction_alert(
        self,
        customer_id: UUID,
        customer_name: str,
        next_order_date,
        stock_status: str,
        recommendation: str,
        days_until_next: int | None,
    ) -> None:
        """Alert the back office that a customer needs a follow-up call/message."""
        if recommendation == "call":
            title = f"Call {customer_name}"
            message = (
                f"{customer_name} is {stock_status.replace('_', ' ')} — "
                f"reach out to re-order"
                + (f" ({days_until_next} day(s) until expected)" if days_until_next is not None else "")
                + "."
            )
        elif recommendation == "message":
            title = f"Follow up with {customer_name}"
            message = (
                f"{customer_name} is {stock_status.replace('_', ' ')} — "
                "send a gentle reminder"
                + (f" ({days_until_next} day(s) until expected)" if days_until_next is not None else "")
                + "."
            )
        else:
            return
        await self.notify(
            category="prediction",
            title=title,
            message=message,
            link=f"/predictions/customers/{customer_id}",
            data={
                "customer_id": str(customer_id),
                "customer_name": customer_name,
                "stock_status": stock_status,
                "recommendation": recommendation,
            },
            recipient_roles=["owner", "admin", "manager"],
            dedupe_key=(
                f"prediction:{customer_id}:{stock_status}:{recommendation}:"
                f"{next_order_date.isoformat() if next_order_date else 'none'}"
            ),
            urgency="high" if stock_status == "overdue" else "normal",
        )

    # ------------------------------------------------------------------
    # Push subscriptions
    # ------------------------------------------------------------------

    async def save_subscription(
        self,
        user_id: UUID,
        endpoint: str,
        p256dh: str,
        auth: str,
        user_agent: str | None = None,
    ) -> None:
        existing = (
            await self.session.execute(
                select(PushSubscription).where(
                    PushSubscription.tenant_id == self.tenant_id,
                    PushSubscription.endpoint == endpoint,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.p256dh = p256dh
            existing.auth = auth
            existing.user_id = user_id
            existing.is_active = True
            await self.session.flush()
            return
        await self.repo.add_subscription(
            PushSubscription(
                tenant_id=self.tenant_id,
                user_id=user_id,
                endpoint=endpoint,
                p256dh=p256dh,
                auth=auth,
                user_agent=user_agent,
            )
        )

    async def remove_subscription(self, endpoint: str) -> None:
        await self.repo.remove_subscription(endpoint)