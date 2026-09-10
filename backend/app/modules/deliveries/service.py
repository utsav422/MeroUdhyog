from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.customers.models import Customer
from app.modules.deliveries.models import Delivery, DeliveryLocation
from app.modules.deliveries.repository import DeliveryRepository
from app.modules.deliveries.schemas import (
    AgentLiveRead,
    DeliveryAssign,
    DeliveryBulkAssignResult,
    DeliveryBulkAssignSkip,
    DeliveryLocationCreate,
    DeliveryLocationRead,
    DeliveryRead,
    DeliveryUpdate,
    LocationReport,
)
from app.modules.finance.service import FinanceService, month_of_dt
from app.modules.orders.models import Order
from app.modules.routes.models import Route
from app.modules.transactions.models import Transaction
from app.modules.users.models import User
from app.shared.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError

VALID_DELIVERY_STATUSES = {
    "pending_assignment",
    "assigned",
    "picked_up",
    "in_transit",
    "delivered",
    "failed",
}
DELIVERY_TRANSITIONS = {
    "pending_assignment": {"assigned"},
    "assigned": {"picked_up"},
    "picked_up": {"in_transit"},
    "in_transit": {"delivered", "failed"},
    "delivered": set(),
    "failed": set(),
}

# Delivery lifecycle -> order status. The order's own workflow stops at
# "ready"; an unassigned delivery keeps the order on "ready" until a manager
# assigns an agent, then the delivery fully drives the order status.
DELIVERY_TO_ORDER_STATUS = {
    "assigned": "assigned",
    "picked_up": "picked_up",
    "in_transit": "in_transit",
    "delivered": "delivered",
    "failed": "failed",
}


class DeliveryService:
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        user_id: UUID | None = None,
        is_agent: bool = False,
    ):
        self.session = session
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.is_agent = is_agent
        self.repo = DeliveryRepository(session, tenant_id)
        self.finance_service = FinanceService(session, tenant_id)

    async def list(
        self,
        limit: int,
        offset: int,
        status: str | None = None,
        agent_id: UUID | None = None,
        route_id: UUID | None = None,
    ) -> list[DeliveryRead]:
        deliveries = await self.repo.list(limit, offset, status, agent_id, route_id)
        return [await self._enrich(d) for d in deliveries]

    async def get(self, delivery_id: UUID) -> DeliveryRead:
        delivery = await self.repo.get(delivery_id)
        return await self._enrich(delivery)

    async def _enrich(self, delivery: Delivery) -> DeliveryRead:
        read = DeliveryRead.model_validate(delivery)
        if delivery.order_id:
            order = (
                await self.session.execute(
                    select(Order).where(Order.id == delivery.order_id)
                )
            ).scalar_one_or_none()
            if order:
                read.order_ref = order.order_ref
                read.delivery_address = order.delivery_address
                if order.delivery_lat is not None:
                    read.delivery_lat = order.delivery_lat
                if order.delivery_lng is not None:
                    read.delivery_lng = order.delivery_lng
                if order.customer_id:
                    customer = (
                        await self.session.execute(
                            select(Customer).where(Customer.id == order.customer_id)
                        )
                    ).scalar_one_or_none()
                    if customer:
                        read.customer_name = customer.name
                        if read.delivery_lat is None:
                            read.delivery_lat = customer.latitude
                        if read.delivery_lng is None:
                            read.delivery_lng = customer.longitude
        return read

    async def create_for_order(self, order_id: UUID) -> DeliveryRead:
        existing = await self.repo.get_by_order_id(order_id)
        if existing:
            raise ConflictError("A delivery already exists for this order")
        order = (
            await self.session.execute(
                select(Order).where(Order.id == order_id, Order.tenant_id == self.tenant_id)
            )
        ).scalar_one_or_none()
        if not order:
            raise NotFoundError("Order not found")
        route_id = order.route_id
        agent_id = None
        if route_id:
            route = (
                await self.session.execute(
                    select(Route)
                    .options(selectinload(Route.agents))
                    .where(Route.id == route_id)
                )
            ).scalar_one_or_none()
            if route and route.agents:
                agent_id = route.agents[0].agent_id
        else:
            if order.customer_id:
                customer = (
                    await self.session.execute(
                        select(Customer).where(Customer.id == order.customer_id)
                    )
                ).scalar_one_or_none()
                if customer and customer.city:
                    route_service = await self._route_service()
                    route = await route_service.repo.find_by_city(customer.city)
                    if route:
                        route_id = route.id
                        if route.agents:
                            agent_id = route.agents[0].agent_id
        delivery = Delivery(
            tenant_id=self.tenant_id,
            order_id=order_id,
            route_id=route_id,
            delivery_agent_id=agent_id,
            status="pending_assignment",
            assigned_at=None,
        )
        created = await self.repo.create(delivery)
        # The delivery stays "pending assignment" until a manager assigns an
        # agent; only then does the linked order move into the delivery flow.
        return await self._enrich(created)

    async def _route_service(self):
        from app.modules.routes.service import RouteService

        return RouteService(self.session, self.tenant_id)

    async def assign(self, delivery_id: UUID, data: DeliveryAssign) -> DeliveryRead:
        delivery = await self.repo.get(delivery_id)
        if delivery.status != "pending_assignment":
            raise ConflictError("Can only assign pending deliveries")
        agent = (
            await self.session.execute(
                select(User.id).where(
                    User.tenant_id == self.tenant_id,
                    User.id == data.delivery_agent_id,
                    User.role == "delivery",
                )
            )
        ).scalar_one_or_none()
        if not agent:
            raise NotFoundError("Delivery agent not found")
        delivery.delivery_agent_id = data.delivery_agent_id
        delivery.status = "assigned"
        delivery.assigned_at = datetime.now(UTC)
        updated = await self.repo.update(delivery)
        # A pending delivery entering the flow syncs the order to "assigned".
        await self._sync_order_status(delivery.order_id, "assigned")
        return await self._enrich(updated)

    async def bulk_assign(
        self, delivery_ids: list[UUID], delivery_agent_id: UUID
    ) -> DeliveryBulkAssignResult:
        """Assign the same delivery agent to many deliveries at once.

        Only pending deliveries are assigned (matching the single-delivery
        rule); everything else is reported as skipped instead of failing the
        whole batch. This powers the route-based "assign one agent per route"
        workflow.
        """
        agent = (
            await self.session.execute(
                select(User.id).where(
                    User.tenant_id == self.tenant_id,
                    User.id == delivery_agent_id,
                    User.role == "delivery",
                )
            )
        ).scalar_one_or_none()
        if not agent:
            raise NotFoundError("Delivery agent not found")
        deliveries = await self.repo.get_many(delivery_ids)
        assigned = 0
        skipped: list[DeliveryBulkAssignSkip] = []
        for delivery in deliveries:
            if delivery.status != "pending_assignment":
                skipped.append(
                    DeliveryBulkAssignSkip(
                        delivery_id=delivery.id,
                        reason=f"Delivery is '{delivery.status}'",
                    )
                )
                continue
            delivery.delivery_agent_id = delivery_agent_id
            delivery.status = "assigned"
            delivery.assigned_at = datetime.now(UTC)
            await self._sync_order_status(delivery.order_id, "assigned")
            assigned += 1
        await self.session.flush()
        return DeliveryBulkAssignResult(assigned=assigned, skipped=skipped)

    async def update_status(
        self, delivery_id: UUID, data: DeliveryUpdate
    ) -> DeliveryRead:
        delivery = await self.repo.get(delivery_id)
        if self.is_agent:
            if delivery.delivery_agent_id is None or delivery.delivery_agent_id != self.user_id:
                raise ForbiddenError("You can only update deliveries assigned to you")
            if data.status in ("assigned", "pending_assignment"):
                raise ForbiddenError("Assignment changes are reserved for managers")
        if data.status:
            if data.status not in VALID_DELIVERY_STATUSES:
                raise ValidationError(f"Invalid status: {data.status}")
            allowed = DELIVERY_TRANSITIONS.get(delivery.status, set())
            if data.status not in allowed:
                raise ConflictError(
                    f"Cannot transition from '{delivery.status}' to '{data.status}'"
                )
            if data.status == "picked_up":
                delivery.picked_up_at = datetime.now(UTC)
            elif data.status == "delivered":
                delivery.delivered_at = datetime.now(UTC)
                if data.delivered_lat is not None:
                    delivery.delivered_lat = data.delivered_lat
                if data.delivered_lng is not None:
                    delivery.delivered_lng = data.delivered_lng
                await self._create_sale_from_delivery(delivery)
            delivery.status = data.status
            # Keep the linked order's status in sync with the delivery lifecycle
            await self._sync_order_status(delivery.order_id, data.status)
        if data.delivered_lat is not None and delivery.delivered_lat is None:
            delivery.delivered_lat = data.delivered_lat
        if data.delivered_lng is not None and delivery.delivered_lng is None:
            delivery.delivered_lng = data.delivered_lng
        if data.proof_notes is not None:
            delivery.proof_notes = data.proof_notes
        updated = await self.repo.update(delivery)
        return await self._enrich(updated)

    async def _sync_order_status(self, order_id: UUID | None, delivery_status: str) -> None:
        """Mirror the delivery lifecycle into the linked order's status."""
        if not order_id:
            return
        order = (
            await self.session.execute(
                select(Order).where(Order.id == order_id)
            )
        ).scalar_one_or_none()
        if not order:
            return
        new_status = DELIVERY_TO_ORDER_STATUS.get(delivery_status)
        if not new_status or order.status == new_status:
            return
        order.status = new_status
        await self.session.flush()

    async def _create_sale_from_delivery(self, delivery: Delivery) -> None:
        order = (
            await self.session.execute(
                select(Order).where(Order.id == delivery.order_id)
            )
        ).scalar_one_or_none()
        if not order:
            return
        sale = Transaction(
            tenant_id=self.tenant_id,
            type="sale",
            transaction_date=datetime.now(UTC),
            amount=order.total_amount,
            description=f"Auto: order {order.order_ref} delivered",
            customer_id=order.customer_id,
        )
        self.session.add(sale)
        await self.session.flush()
        await self.finance_service.recalculate({month_of_dt(sale.transaction_date)})

    async def add_location(
        self, delivery_id: UUID, data: DeliveryLocationCreate
    ) -> DeliveryLocationRead:
        delivery = await self.repo.get(delivery_id)
        location = DeliveryLocation(
            delivery_id=delivery.id,
            lat=data.lat,
            lng=data.lng,
            recorded_at=datetime.now(UTC),
        )
        created = await self.repo.add_location(location)
        return DeliveryLocationRead.model_validate(created)

    async def list_locations(
        self, delivery_id: UUID
    ) -> list[DeliveryLocationRead]:
        await self.repo.get(delivery_id)
        locations = await self.repo.list_locations(delivery_id)
        return [DeliveryLocationRead.model_validate(loc) for loc in locations]

    async def report_location(self, user_id: UUID, data: LocationReport) -> None:
        """Update the caller's own live GPS coordinates (used for agent tracking)."""
        user = (
            await self.session.execute(
                select(User).where(User.id == user_id, User.tenant_id == self.tenant_id)
            )
        ).scalar_one_or_none()
        if not user:
            raise NotFoundError("User not found")
        user.agent_lat = data.latitude
        user.agent_lng = data.longitude
        user.agent_location_updated_at = datetime.now(UTC)
        await self.session.flush()

    async def list_agents(self) -> list[AgentLiveRead]:
        """Return delivery staff with their last known GPS position."""
        rows = (
            await self.session.execute(
                select(
                    User.id,
                    User.full_name,
                    User.email,
                    User.agent_lat,
                    User.agent_lng,
                    User.agent_location_updated_at,
                ).where(
                    User.tenant_id == self.tenant_id,
                    User.role == "delivery",
                )
            )
        ).all()
        agents: list[AgentLiveRead] = []
        for row in rows:
            active = (
                await self.session.scalar(
                    select(Delivery.id)
                    .where(
                        Delivery.tenant_id == self.tenant_id,
                        Delivery.delivery_agent_id == row.id,
                        Delivery.status.in_(("assigned", "picked_up", "in_transit")),
                    )
                    .limit(1)
                )
            )
            agents.append(
                AgentLiveRead(
                    id=row.id,
                    full_name=row.full_name,
                    email=row.email,
                    agent_lat=row.agent_lat,
                    agent_lng=row.agent_lng,
                    agent_location_updated_at=row.agent_location_updated_at,
                    active_deliveries=1 if active else 0,
                )
            )
        return agents
