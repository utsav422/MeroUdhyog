import uuid

import pytest


async def _register(client, slug, role="owner"):
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


async def _create_product(client, name, price="10.00"):
    r = await client.post(
        "/api/v1/products",
        json={
            "name": name,
            "variants": [
                {
                    "name": "Default",
                    "sku": f"VAR-{name}-{uuid.uuid4().hex[:4]}",
                    "stock_quantity": 100,
                    "prices": [{"price": price}],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_customer(client, name="Acme", city="Kathmandu"):
    r = await client.post(
        "/api/v1/customers",
        json={
            "name": name,
            "email": f"{name.lower()}{uuid.uuid4().hex[:6]}@acme.com",
            "phone": "555-0100",
            "contact_number": "+977-9812345678",
            "city": city,
            "address": "123 Test St",
            "latitude": "27.7172",
            "longitude": "85.3240",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_customer_contact_and_location_fields(client):
    await _register(client, "custloc")
    customer = await _create_customer(client)
    assert customer["city"] == "Kathmandu"
    assert customer["contact_number"] == "+977-9812345678"
    assert customer["latitude"] == "27.717200"
    assert customer["longitude"] == "85.324000"

    r = await client.patch(
        f"/api/v1/customers/{customer['id']}",
        json={"city": "Lalitpur", "longitude": "85.3300"},
    )
    assert r.status_code == 200
    assert r.json()["city"] == "Lalitpur"


@pytest.mark.asyncio
async def test_customer_specific_price_used_in_order(client):
    await _register(client, "custprice")
    product = await _create_product(client, "Chowmein", price="10.00")
    variant_id = product["variants"][0]["id"]
    customer = await _create_customer(client)

    r = await client.post(
        f"/api/v1/customers/{customer['id']}/prices",
        json={"variant_id": variant_id, "price": "8.00"},
    )
    assert r.status_code == 201, r.text

    r = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["id"],
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": variant_id,
                    "quantity": "2.00",
                    "unit_price": "99.00",
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["total_amount"] == "16.00"
    assert order["items"][0]["unit_price"] == "8.00"


@pytest.mark.asyncio
async def test_order_falls_back_to_default_price_without_customer_price(client):
    await _register(client, "defaultprice")
    product = await _create_product(client, "Pasta", price="10.00")
    variant_id = product["variants"][0]["id"]
    customer = await _create_customer(client)

    r = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["id"],
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": variant_id,
                    "quantity": "1.00",
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["items"][0]["unit_price"] == "10.00"


@pytest.mark.asyncio
async def test_route_crud_and_resolve_by_city(client):
    tokens = await _register(client, "routecrud")
    tenant_id = tokens["tenant_id"]
    agent_id = await _create_role_user(
        tenant_id, "delivery", f"routeagent{uuid.uuid4().hex[:6]}@test.com"
    )

    r = await client.post(
        "/api/v1/routes",
        json={
            "name": "Valley Route A",
            "description": "Kathmandu + Lalitpur",
            "cities": ["Kathmandu", "Lalitpur"],
            "agent_ids": [str(agent_id)],
        },
    )
    assert r.status_code == 201, r.text
    route = r.json()
    assert route["cities"] == ["Kathmandu", "Lalitpur"]
    assert route["agent_ids"] == [str(agent_id)]
    route_id = route["id"]

    r = await client.get(f"/api/v1/routes/{route_id}")
    assert r.status_code == 200

    r = await client.patch(
        f"/api/v1/routes/{route_id}",
        json={"cities": ["Kathmandu"], "agent_ids": [str(agent_id)]},
    )
    assert r.status_code == 200
    assert r.json()["cities"] == ["Kathmandu"]

    from app.core.database import get_session
    from app.modules.routes.service import RouteService

    async with get_session() as session:
        svc = RouteService(session, tenant_id)
        agent = await svc.find_agent_id_for_city("Kathmandu")
        assert agent == agent_id
        assert await svc.find_agent_id_for_city("Pokhara") is None


@pytest.mark.asyncio
async def test_delivery_created_with_route_and_agent_from_customer_city(client):
    tokens = await _register(client, "delroute")
    tenant_id = tokens["tenant_id"]
    agent_id = await _create_role_user(
        tenant_id, "delivery", f"delagent{uuid.uuid4().hex[:6]}@test.com"
    )

    r = await client.post(
        "/api/v1/routes",
        json={
            "name": "Route B",
            "cities": ["Patan"],
            "agent_ids": [str(agent_id)],
        },
    )
    assert r.status_code == 201

    product = await _create_product(client, "Sauce")
    customer = await _create_customer(client, name="PatanBuyer", city="Patan")

    r = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["id"],
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "1.00",
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["delivery_address"] == "123 Test St"

    r = await client.post(f"/api/v1/deliveries/from-order/{order['id']}")
    assert r.status_code == 201, r.text
    delivery = r.json()
    # The route pre-fills the agent, but the delivery stays "pending assignment"
    # until a manager confirms the assignment.
    assert delivery["delivery_agent_id"] == str(agent_id)
    assert delivery["status"] == "pending_assignment"


@pytest.mark.asyncio
async def test_route_tenant_isolation(client):
    await _register(client, "routeniso1")
    r = await client.post(
        "/api/v1/routes",
        json={"name": "Route X", "cities": ["Kathmandu"], "agent_ids": []},
    )
    assert r.status_code == 201
    first_id = r.json()["id"]

    await _register(client, "routeniso2")
    r = await client.get("/api/v1/routes")
    assert r.status_code == 200
    assert first_id not in [x["id"] for x in r.json()]


@pytest.mark.asyncio
async def test_customers_list_filtered_by_route(client):
    await _register(client, "custroutefilter")
    r = await client.post(
        "/api/v1/routes",
        json={"name": "North", "cities": [], "agent_ids": []},
    )
    assert r.status_code == 201
    route_id = r.json()["id"]

    on_route = await _create_customer(client, name="Alpha")
    r = await client.patch(
        f"/api/v1/customers/{on_route['id']}", json={"route_id": route_id}
    )
    assert r.status_code == 200

    await _create_customer(client, name="Beta")

    r = await client.get(f"/api/v1/customers?limit=10&offset=0&route_id={route_id}")
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert on_route["id"] in ids
    assert all(c["route_id"] == route_id for c in r.json())

    r = await client.get("/api/v1/customers?limit=10&offset=0")
    assert len(r.json()) == 2
