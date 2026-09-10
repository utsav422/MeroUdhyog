import uuid
from decimal import Decimal

import pytest


async def _register(client, slug):
    email = f"{slug}@test.com"
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": slug,
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


async def _create_product(client, name):
    r = await client.post(
        "/api/v1/products",
        json={
            "name": name,
            "variants": [
                {
                    "name": "Default",
                    "sku": f"VAR-{name}",
                    "stock_quantity": 100,
                    "prices": [{"price": "10.00"}],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_ready_order(client, product):
    r = await client.post(
        "/api/v1/orders",
        json={
            "delivery_address": "123 Main",
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "1",
                    "unit_price": "10.00",
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    order = r.json()
    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "confirmed"})
    assert r.status_code == 200
    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "ready"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_create_and_assign_delivery_flow(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Sauce")
    order = await _create_ready_order(client, product)

    # A ready order appears in the delivery pipeline as "pending assignment"
    r = await client.get("/api/v1/deliveries")
    assert r.status_code == 200
    delivery = next(d for d in r.json() if d["order_id"] == order["id"])
    assert delivery["status"] == "pending_assignment"
    assert delivery["order_ref"] == order["order_ref"]
    assert delivery["delivery_agent_id"] is None
    did = delivery["id"]

    r = await client.patch(
        f"/api/v1/deliveries/{did}/assign", json={"delivery_agent_id": str(uuid.uuid4())}
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delivery_status_lifecycle_and_sale_created(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    product = await _create_product(client, "Pesto")
    order = await _create_ready_order(client, product)

    agent_id = await _create_role_user(
        tenant_id, "delivery", f"ag{uuid.uuid4().hex[:6]}@test.com"
    )

    r = await client.get("/api/v1/deliveries")
    delivery = next(d for d in r.json() if d["order_id"] == order["id"])
    did = delivery["id"]

    r = await client.patch(
        f"/api/v1/deliveries/{did}/assign", json={"delivery_agent_id": str(agent_id)}
    )
    assert r.status_code == 200
    assert r.json()["status"] == "assigned"

    r = await client.patch(f"/api/v1/deliveries/{did}", json={"status": "picked_up"})
    assert r.status_code == 200
    assert r.json()["picked_up_at"] is not None

    r = await client.patch(
        f"/api/v1/deliveries/{did}",
        json={"status": "in_transit"},
    )
    assert r.status_code == 200

    r = await client.patch(
        f"/api/v1/deliveries/{did}",
        json={
            "status": "delivered",
            "delivered_lat": "19.0760",
            "delivered_lng": "72.8770",
            "proof_notes": "Handed to reception",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["delivered_at"] is not None

    r = await client.get("/api/v1/transactions")
    assert r.status_code == 200
    sales = r.json()
    assert any(
        float(t["amount"]) == 10.00
        and "auto" in (t.get("description") or "").lower()
        for t in sales
    )


@pytest.mark.asyncio
async def test_invalid_delivery_transition(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Mayo")
    order = await _create_ready_order(client, product)
    r = await client.get("/api/v1/deliveries")
    did = next(d["id"] for d in r.json() if d["order_id"] == order["id"])

    r = await client.patch(f"/api/v1/deliveries/{did}", json={"status": "delivered"})
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_delivery_location_plumbing(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Vinegar")
    order = await _create_ready_order(client, product)
    r = await client.get("/api/v1/deliveries")
    did = next(d["id"] for d in r.json() if d["order_id"] == order["id"])

    r = await client.post(
        f"/api/v1/deliveries/{did}/locations",
        json={"lat": "19.076", "lng": "72.877"},
    )
    assert r.status_code == 201, r.text

    r = await client.get(f"/api/v1/deliveries/{did}/locations")
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.asyncio
async def test_delivery_transitions_sync_order_status(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    product = await _create_product(client, "Chutney")
    order = await _create_ready_order(client, product)
    # An unassigned ready order stays "ready" until an agent is assigned
    assert order["status"] == "ready"

    agent_id = await _create_role_user(
        tenant_id, "delivery", f"sy{uuid.uuid4().hex[:6]}@test.com"
    )
    r = await client.get("/api/v1/deliveries")
    assert r.status_code == 200
    did = next(d["id"] for d in r.json() if d["order_id"] == order["id"])
    r = await client.patch(
        f"/api/v1/deliveries/{did}/assign", json={"delivery_agent_id": str(agent_id)}
    )
    assert r.status_code == 200
    r = await client.get(f"/api/v1/orders/{order['id']}")
    assert r.json()["status"] == "assigned"

    r = await client.patch(f"/api/v1/deliveries/{did}", json={"status": "picked_up"})
    assert r.status_code == 200
    r = await client.get(f"/api/v1/orders/{order['id']}")
    assert r.json()["status"] == "picked_up"

    # in_transit -> order becomes in_transit
    r = await client.patch(f"/api/v1/deliveries/{did}", json={"status": "in_transit"})
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/v1/orders/{order['id']}")
    assert r.json()["status"] == "in_transit"

    # delivered -> order becomes delivered
    r = await client.patch(f"/api/v1/deliveries/{did}", json={"status": "delivered"})
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/v1/orders/{order['id']}")
    assert r.json()["status"] == "delivered"


@pytest.mark.asyncio
async def test_failed_delivery_syncs_order_as_failed(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    product = await _create_product(client, "Pickle")
    order = await _create_ready_order(client, product)
    assert order["status"] == "ready"

    agent_id = await _create_role_user(
        tenant_id, "delivery", f"fa{uuid.uuid4().hex[:6]}@test.com"
    )
    r = await client.get("/api/v1/deliveries")
    assert r.status_code == 200
    did = next(d["id"] for d in r.json() if d["order_id"] == order["id"])
    r = await client.patch(
        f"/api/v1/deliveries/{did}/assign", json={"delivery_agent_id": str(agent_id)}
    )
    assert r.status_code == 200
    for st in ("picked_up", "in_transit"):
        r = await client.patch(f"/api/v1/deliveries/{did}", json={"status": st})
        assert r.status_code == 200, r.text

    r = await client.patch(f"/api/v1/deliveries/{did}", json={"status": "failed"})
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/v1/orders/{order['id']}")
    assert r.json()["status"] == "failed"


@pytest.mark.asyncio
async def test_my_deliveries_and_coordinates_enrichment(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]

    # Create a customer with lat/lng so the order inherits coordinates
    r = await client.post(
        "/api/v1/customers",
        json={
            "name": "Portal Customer",
            "city": "Karachi",
            "latitude": "24.8607",
            "longitude": "67.0011",
        },
    )
    assert r.status_code == 201, r.text
    customer_id = r.json()["id"]

    product = await _create_product(client, "PortalSauce")
    r = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer_id,
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "1",
                    "unit_price": "10.00",
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    order = r.json()
    assert Decimal(order["delivery_lat"]) == Decimal("24.8607")

    agent_email = f"pt{uuid.uuid4().hex[:6]}@test.com"
    other_email = f"ot{uuid.uuid4().hex[:6]}@test.com"
    agent_id = await _create_role_user(tenant_id, "delivery", agent_email)
    other_agent_id = await _create_role_user(tenant_id, "delivery", other_email)

    r = await client.post(f"/api/v1/deliveries/from-order/{order['id']}")
    did = r.json()["id"]
    r = await client.patch(
        f"/api/v1/deliveries/{did}/assign", json={"delivery_agent_id": str(agent_id)}
    )
    assert r.status_code == 200

    # Create a second order+delivery assigned to the OTHER agent
    r = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer_id,
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "1",
                    "unit_price": "10.00",
                }
            ],
        },
    )
    other_order = r.json()
    r = await client.post(f"/api/v1/deliveries/from-order/{other_order['id']}")
    other_did = r.json()["id"]
    r = await client.patch(
        f"/api/v1/deliveries/{other_did}/assign",
        json={"delivery_agent_id": str(other_agent_id)},
    )
    assert r.status_code == 200

    # Log in as the delivery agent (switches the client cookie)
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": agent_email, "password": "Sup3rSecret!2026"},
    )
    assert r.status_code == 200, r.text

    # /deliveries/me returns only the deliveries assigned to this agent
    r = await client.get("/api/v1/deliveries/me")
    assert r.status_code == 200, r.text
    mine = r.json()
    assert len(mine) == 1
    assert mine[0]["id"] == did
    assert Decimal(mine[0]["delivery_lat"]) == Decimal("24.8607")
    assert Decimal(mine[0]["delivery_lng"]) == Decimal("67.0011")
    assert mine[0]["customer_name"] == "Portal Customer"

    # Agent can update the status of their own delivery
    r = await client.patch(f"/api/v1/deliveries/{did}", json={"status": "picked_up"})
    assert r.status_code == 200, r.text

    # Agent cannot update a delivery assigned to someone else
    r = await client.patch(f"/api/v1/deliveries/{other_did}", json={"status": "picked_up"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_catalog_manager_sees_all_deliveries_in_portal(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]

    product = await _create_product(client, "MgrSauce")
    order_a = await _create_ready_order(client, product)
    order_b = await _create_ready_order(client, product)

    agent_email = f"mg{uuid.uuid4().hex[:6]}@test.com"
    agent_id = await _create_role_user(tenant_id, "delivery", agent_email)

    for order in (order_a, order_b):
        r = await client.get("/api/v1/deliveries")
        assert r.status_code == 200
        did = next(d["id"] for d in r.json() if d["order_id"] == order["id"])
        r = await client.patch(
            f"/api/v1/deliveries/{did}/assign", json={"delivery_agent_id": str(agent_id)}
        )
        assert r.status_code == 200

    manager_email = f"mn{uuid.uuid4().hex[:6]}@test.com"
    await _create_role_user(tenant_id, "manager", manager_email)

    r = await client.post(
        "/api/v1/auth/login",
        json={"email": manager_email, "password": "Sup3rSecret!2026"},
    )
    assert r.status_code == 200, r.text

    # A manager (catalog manager, not a delivery agent) sees ALL deliveries.
    r = await client.get("/api/v1/deliveries/me")
    assert r.status_code == 200, r.text
    assert len(r.json()) == 2


@pytest.mark.asyncio
async def test_agent_reports_location_and_owner_sees_live_agents(client):
    slug = f"t{uuid.uuid4().hex[:6]}"
    tokens = await _register(client, slug)
    tenant_id = tokens["tenant_id"]

    product = await _create_product(client, "LiveSauce")
    order = await _create_ready_order(client, product)

    agent_email = f"live{uuid.uuid4().hex[:6]}@test.com"
    agent_id = await _create_role_user(tenant_id, "delivery", agent_email)

    r = await client.get("/api/v1/deliveries")
    assert r.status_code == 200
    did = next(d["id"] for d in r.json() if d["order_id"] == order["id"])
    r = await client.patch(
        f"/api/v1/deliveries/{did}/assign", json={"delivery_agent_id": str(agent_id)}
    )
    assert r.status_code == 200

    # Log in as the delivery agent and report a GPS position
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": agent_email, "password": "Sup3rSecret!2026"},
    )
    assert r.status_code == 200, r.text
    r = await client.post(
        "/api/v1/deliveries/me/location",
        json={"latitude": "27.6876", "longitude": "85.3229"},
    )
    assert r.status_code == 204, r.text

    # The owner sees the agent as live with coordinates and an active delivery
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": f"{slug}@test.com", "password": "Sup3rSecret!2026"},
    )
    assert r.status_code == 200, r.text
    r = await client.get("/api/v1/deliveries/agents")
    assert r.status_code == 200, r.text
    agents = r.json()
    assert len(agents) == 1
    agent = agents[0]
    assert agent["full_name"] == "Delivery"
    assert Decimal(agent["agent_lat"]) == Decimal("27.6876")
    assert Decimal(agent["agent_lng"]) == Decimal("85.3229")
    assert agent["agent_location_updated_at"] is not None
    assert agent["active_deliveries"] == 1
