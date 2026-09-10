import uuid

import pytest


async def _register(client, slug):
    email = f"{slug}{uuid.uuid4().hex[:6]}@test.com"
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": f"{slug}{uuid.uuid4().hex[:6]}",
            "email": email,
            "password": "Sup3rSecret!2026",
            "full_name": "Test Owner",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_role_user(tenant_id, role, email):
    from app.core.database import get_session
    from app.core.security import get_password_hash
    from app.modules.users.models import User

    async with get_session() as session:
        user = User(
            tenant_id=tenant_id,
            email=email,
            hashed_password=get_password_hash("Sup3rSecret!2026"),
            full_name=role.title(),
            role=role,
        )
        session.add(user)
        await session.flush()
        user_id = user.id
    return user_id


async def _create_route(client, name="North"):
    r = await client.post(
        "/api/v1/routes",
        json={"name": name, "description": "Test route", "cities": [], "agent_ids": []},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_product(client, name):
    r = await client.post(
        "/api/v1/products",
        json={
            "name": name,
            "variants": [
                {
                    "name": "Default",
                    "sku": f"VAR-{name}-{uuid.uuid4().hex[:4]}",
                    "stock_quantity": 100,
                    "prices": [{"price": "10.00"}],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_customer(client, route_id=None, name="Acme"):
    r = await client.post(
        "/api/v1/customers",
        json={
            "name": name,
            "email": f"{name.lower()}{uuid.uuid4().hex[:6]}@acme.com",
            "city": "Kathmandu",
            "route_id": route_id,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_order(client, product, customer=None):
    r = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["id"] if customer else None,
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "2.00",
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _set_order_ready(client, order_id):
    for status in ("confirmed", "ready"):
        r = await client.patch(f"/api/v1/orders/{order_id}", json={"status": status})
        assert r.status_code == 200, r.text
    return True


@pytest.mark.asyncio
async def test_customer_route_link_and_order_inherits_route(client):
    await _register(client, "routelink")
    route = await _create_route(client)
    customer = await _create_customer(client, route_id=route["id"])
    assert customer["route_id"] == route["id"]

    product = await _create_product(client, "Rice")
    order = await _create_order(client, product, customer)
    assert order["route_id"] == route["id"]
    assert order["route_name"] == "North"

    # A customer on another route produces an order on that route.
    other_route = await _create_route(client, "South")
    other_route_customer = await _create_customer(client, route_id=other_route["id"], name="Beta")
    other_order = await _create_order(client, product, other_route_customer)
    assert other_order["route_id"] == other_route["id"]
    assert other_order["route_name"] == "South"


@pytest.mark.asyncio
async def test_customer_without_route_creates_routeless_order(client):
    await _register(client, "noroute")
    customer = await _create_customer(client)
    assert customer["route_id"] is None
    product = await _create_product(client, "Lentils")
    order = await _create_order(client, product, customer)
    assert order["route_id"] is None
    assert order["route_name"] is None


@pytest.mark.asyncio
async def test_switch_customer_route_updates_linked_order_route(client):
    await _register(client, "routeswitch")
    route_a = await _create_route(client, "East")
    route_b = await _create_route(client, "West")
    customer = await _create_customer(client, name="Gamma")

    product = await _create_product(client, "Flour")
    order = await _create_order(client, product, customer)
    assert order["route_id"] is None

    # Assign the customer to a route, then reconnect the order to the customer
    # (frontend sends customer_id on edit) — the order picks up the route.
    r = await client.patch(
        f"/api/v1/customers/{customer['id']}", json={"route_id": route_a["id"]}
    )
    assert r.status_code == 200
    assert r.json()["route_id"] == route_a["id"]

    r = await client.patch(
        f"/api/v1/orders/{order['id']}",
        json={"customer_id": customer["id"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["route_id"] == route_a["id"]
    assert r.json()["route_name"] == "East"

    r = await client.patch(
        f"/api/v1/customers/{customer['id']}", json={"route_id": route_b["id"]}
    )
    assert r.status_code == 200
    r = await client.patch(
        f"/api/v1/orders/{order['id']}", json={"customer_id": customer["id"]}
    )
    assert r.status_code == 200
    assert r.json()["route_id"] == route_b["id"]


@pytest.mark.asyncio
async def test_customer_route_must_belong_to_tenant(client):
    await _register(client, "routeguard")
    foreign_route = await _create_route(client, "Foreign")
    await _register(client, "other")
    r = await client.post(
        "/api/v1/customers",
        json={"name": "Intruder", "route_id": foreign_route["id"]},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_orders_list_filtered_by_route(client):
    await _register(client, "routefilter")
    route = await _create_route(client, "Central")
    customer = await _create_customer(client, route_id=route["id"])
    other_customer = await _create_customer(client, name="Other")

    product = await _create_product(client, "Spice")
    on_route = await _create_order(client, product, customer)
    await _create_order(client, product, other_customer)

    r = await client.get(f"/api/v1/orders?route_id={route['id']}")
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()]
    assert on_route["id"] in ids
    assert all(o["route_id"] == route["id"] for o in r.json())


@pytest.mark.asyncio
async def test_bulk_update_status_only_valid_transitions(client):
    await _register(client, "bulkstatus")
    product = await _create_product(client, "Oregano")
    draft_a = await _create_order(client, product)
    draft_b = await _create_order(client, product)
    confirmed = await _create_order(client, product)
    r = await client.patch(
        f"/api/v1/orders/{confirmed['id']}", json={"status": "confirmed"}
    )
    assert r.status_code == 200

    r = await client.post(
        "/api/v1/orders/bulk-status",
        json={"order_ids": [draft_a["id"], draft_b["id"], confirmed["id"]], "status": "confirmed"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["updated"] == 2
    assert [s["order_id"] for s in body["skipped"]] == [confirmed["id"]]
    assert "Cannot transition" in body["skipped"][0]["reason"]

    for oid in (draft_a["id"], draft_b["id"], confirmed["id"]):
        r = await client.get(f"/api/v1/orders/{oid}")
        assert r.json()["status"] == "confirmed"


@pytest.mark.asyncio
async def test_bulk_update_cancel_releases_stock(client):
    tokens = await _register(client, "bulkcancel")
    agent_id = await _create_role_user(
        tokens["tenant_id"], "delivery", f"agent{uuid.uuid4().hex[:6]}@test.com"
    )
    product = await _create_product(client, "Turmeric")
    variant_id = product["variants"][0]["id"]

    order = await _create_order(client, product)
    order2 = await _create_order(client, product)
    delivered = await _create_order(client, product)

    # Drive one order to "delivered" via the delivery lifecycle.
    assert await _set_order_ready(client, delivered["id"])
    r = await client.get("/api/v1/deliveries")
    delivery_id = r.json()[0]["id"]
    r = await client.patch(
        f"/api/v1/deliveries/{delivery_id}/assign",
        json={"delivery_agent_id": str(agent_id)},
    )
    assert r.status_code == 200
    for status in ("picked_up", "in_transit", "delivered"):
        r = await client.patch(f"/api/v1/deliveries/{delivery_id}", json={"status": status})
        assert r.status_code == 200
    r = await client.get(f"/api/v1/orders/{delivered['id']}")
    assert r.json()["status"] == "delivered"

    r = await client.post(
        "/api/v1/orders/bulk-status",
        json={
            "order_ids": [order["id"], order2["id"], delivered["id"]],
            "status": "cancelled",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["updated"] == 2
    assert [s["order_id"] for s in body["skipped"]] == [delivered["id"]]

    # Cancelling released the reserved stock of the two cancelled orders; the
    # delivered order still holds its 2 reserved units.
    r = await client.get(f"/api/v1/products/{product['id']}")
    variant = next(v for v in r.json()["variants"] if v["id"] == variant_id)
    assert variant["stock_quantity"] == 98


@pytest.mark.asyncio
async def test_bulk_update_status_validates_input(client):
    await _register(client, "bulkinput")
    product = await _create_product(client, "Cumin")
    order = await _create_order(client, product)

    r = await client.post(
        "/api/v1/orders/bulk-status",
        json={"order_ids": [order["id"]], "status": "bogus"},
    )
    assert r.status_code == 422

    r = await client.post(
        "/api/v1/orders/bulk-status",
        json={"order_ids": [], "status": "confirmed"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_delivery_created_for_route_inherits_route(client):
    await _register(client, "delroute")
    route = await _create_route(client, "Hills")
    customer = await _create_customer(client, route_id=route["id"])
    product = await _create_product(client, "Mustard")
    order = await _create_order(client, product, customer)

    assert await _set_order_ready(client, order["id"])

    r = await client.get("/api/v1/deliveries")
    assert r.status_code == 200
    deliveries = r.json()
    assert len(deliveries) == 1
    assert deliveries[0]["route_id"] == route["id"]
    assert deliveries[0]["order_id"] == order["id"]


@pytest.mark.asyncio
async def test_bulk_assign_agent_per_route(client):
    tokens = await _register(client, "bulkassign")
    agent_id = await _create_role_user(
        tokens["tenant_id"], "delivery", f"agent{uuid.uuid4().hex[:6]}@test.com"
    )
    route = await _create_route(client, "Valley")
    customer = await _create_customer(client, route_id=route["id"])
    product = await _create_product(client, "Pepper")

    o1 = await _create_order(client, product, customer)
    o2 = await _create_order(client, product, customer)
    for oid in (o1["id"], o2["id"]):
        assert await _set_order_ready(client, oid)

    r = await client.get(f"/api/v1/deliveries?route_id={route['id']}")
    assert r.status_code == 200
    delivery_ids = [d["id"] for d in r.json()]
    assert len(delivery_ids) == 2

    r = await client.post(
        "/api/v1/deliveries/bulk-assign",
        json={"delivery_ids": delivery_ids, "delivery_agent_id": str(agent_id)},
    )
    assert r.status_code == 200, r.text
    assert r.json()["assigned"] == 2
    assert r.json()["skipped"] == []

    r = await client.get("/api/v1/deliveries")
    assert r.status_code == 200
    for d in r.json():
        assert d["delivery_agent_id"] == str(agent_id)
        assert d["status"] == "assigned"
    # Assignment pushes the linked orders into the flow.
    for oid in (o1["id"], o2["id"]):
        r = await client.get(f"/api/v1/orders/{oid}")
        assert r.json()["status"] == "assigned"

    # Already-assigned deliveries are skipped on a second pass.
    r = await client.post(
        "/api/v1/deliveries/bulk-assign",
        json={"delivery_ids": delivery_ids, "delivery_agent_id": str(agent_id)},
    )
    assert r.status_code == 200
    assert r.json()["assigned"] == 0
    assert len(r.json()["skipped"]) == 2


@pytest.mark.asyncio
async def test_bulk_assign_rejects_unknown_agent(client):
    await _register(client, "bulkagent")
    route = await _create_route(client, "Coast")
    customer = await _create_customer(client, route_id=route["id"])
    product = await _create_product(client, "Salt")
    order = await _create_order(client, product, customer)
    assert await _set_order_ready(client, order["id"])

    r = await client.get("/api/v1/deliveries")
    delivery_id = r.json()[0]["id"]

    r = await client.post(
        "/api/v1/deliveries/bulk-assign",
        json={"delivery_ids": [delivery_id], "delivery_agent_id": str(uuid.uuid4())},
    )
    assert r.status_code == 404