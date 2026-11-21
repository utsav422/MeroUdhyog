import asyncio
import uuid

import pytest

from app.core.realtime import realtime_bus
from app.modules.notifications.router import _event_visible


async def _new_order(client):
    slug = f"rt{uuid.uuid4().hex[:6]}"
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": slug,
            "email": f"{slug}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Realtime Owner",
        },
    )
    assert registered.status_code == 201, registered.text

    product = await client.post(
        "/api/v1/products",
        json={
            "name": "Realtime Sauce",
            "variants": [
                {
                    "name": "Default",
                    "sku": f"RT-{slug}",
                    "stock_quantity": 100,
                    "prices": [{"price": "10.00"}],
                }
            ],
        },
    )
    assert product.status_code == 201, product.text
    product_id = product.json()["variants"][0]["id"]

    order = await client.post(
        "/api/v1/orders",
        json={
            "delivery_address": "123 Main St",
            "items": [
                {
                    "product_id": product.json()["id"],
                    "variant_id": product_id,
                    "quantity": "2.00",
                    "unit_price": "10.00",
                }
            ],
        },
    )
    assert order.status_code == 201, order.text
    return order.json()


def test_realtime_bus_fanout():
    first = realtime_bus.subscribe()
    second = realtime_bus.subscribe()
    try:
        event = {"id": "evt-1"}
        realtime_bus.publish(event)
        assert first.get_nowait() == event
        assert second.get_nowait() == event
    finally:
        realtime_bus.unsubscribe(first)
        realtime_bus.unsubscribe(second)


def test_event_visibility_filters_tenant_recipient_and_role():
    tenant_id = uuid.uuid4()
    user_id = uuid.uuid4()
    event = {
        "tenant_id": str(tenant_id),
        "recipient_user_id": None,
        "recipient_roles": ["owner", "admin"],
    }
    assert _event_visible(event, tenant_id, user_id, "admin")
    assert not _event_visible(event, tenant_id, user_id, "delivery")
    assert not _event_visible(event, uuid.uuid4(), user_id, "admin")

    direct = {**event, "recipient_user_id": str(user_id), "recipient_roles": None}
    assert _event_visible(direct, tenant_id, user_id, "delivery")
    assert not _event_visible(direct, tenant_id, uuid.uuid4(), "delivery")


@pytest.mark.asyncio
async def test_order_status_publishes_realtime_notification(client):
    order = await _new_order(client)
    order_id = order["id"]

    queue = realtime_bus.subscribe()
    try:
        patched = await client.patch(
            f"/api/v1/orders/{order_id}", json={"status": "confirmed"}
        )
        assert patched.status_code == 200, patched.text
        event = await asyncio.wait_for(queue.get(), timeout=5)
    finally:
        realtime_bus.unsubscribe(queue)

    assert event["category"] == "order"
    assert event["title"] == "Order confirmed"
    assert event["data"]["order_id"] == order_id
    assert event["data"]["status"] == "confirmed"
    assert event["recipient_roles"]
