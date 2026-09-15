import uuid

import pytest

from app.core.security import create_access_token


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


async def _create_customer(client, name="Acme"):
    r = await client.post(
        "/api/v1/customers",
        json={"name": name, "email": f"{name.lower()}{uuid.uuid4().hex[:6]}@acme.com"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_order(client, product, customer=None):
    items = [
        {
            "product_id": product["id"],
            "variant_id": product["variants"][0]["id"],
            "quantity": "2.00",
            "unit_price": "10.00",
        }
    ]
    payload = {
        "customer_id": customer["id"] if customer else None,
        "delivery_address": "123 Main St",
        "delivery_lat": "19.076", 
        "delivery_lng": "72.877",
        "items": items,
    }
    r = await client.post("/api/v1/orders", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_owner_can_create_get_list_order(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Sauce")
    customer = await _create_customer(client)

    order = await _create_order(client, product, customer)
    assert order["order_ref"].startswith("ORD-")
    assert order["total_amount"] == "20.00"
    assert order["status"] == "draft"
    oid = order["id"]

    r = await client.get(f"/api/v1/orders/{oid}")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1

    r = await client.get("/api/v1/orders")
    assert r.status_code == 200
    assert oid in [o["id"] for o in r.json()]


@pytest.mark.asyncio
async def test_order_status_transitions(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Pesto")
    order = await _create_order(client, product)

    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "confirmed"})
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"

    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "ready"})
    assert r.status_code == 200

    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "draft"})
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_order_invalid_status_and_item_validation(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Ketchup")
    order = await _create_order(client, product)

    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "bogus"})
    assert r.status_code == 422

    r = await client.post(
        "/api/v1/orders",
        json={
            "items": [
                {
                    "product_id": str(uuid.uuid4()),
                    "quantity": "1",
                    "unit_price": "5.00",
                }
            ]
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_only_draft_order_can_be_deleted(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Mayo")
    order = await _create_order(client, product)
    await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "confirmed"})
    r = await client.delete(f"/api/v1/orders/{order['id']}")
    assert r.status_code == 409

    order2 = await _create_order(client, product)
    r = await client.delete(f"/api/v1/orders/{order2['id']}")
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_tenant_isolation_on_orders(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Vinegar")
    order = await _create_order(client, product)

    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await client.get("/api/v1/orders")
    assert r.status_code == 200
    assert order["id"] not in [o["id"] for o in r.json()]


@pytest.mark.asyncio
async def test_delivery_role_permissions(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    delivery_id = await _create_role_user(
        tenant_id, "delivery", f"d{uuid.uuid4().hex[:6]}@test.com"
    )
    client.cookies["access_token"] = create_access_token(delivery_id, tenant_id)

    r = await client.get("/api/v1/deliveries")
    assert r.status_code == 200

    r = await client.post("/api/v1/orders", json={"items": []})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_update_order_items(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Salsa")
    product2 = await _create_product(client, "Guac")
    order = await _create_order(client, product)

    r = await client.patch(
        f"/api/v1/orders/{order['id']}",
        json={
            "items": [
                {
                    "product_id": product2["id"],
                    "variant_id": product2["variants"][0]["id"],
                    "quantity": "3.00",
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    updated = r.json()
    # payment status is owned by the khata ledger; it cannot be changed here
    assert updated["payment_status"] == "unpaid"
    assert updated["total_amount"] == "30.00"
    assert len(updated["items"]) == 1
    assert updated["items"][0]["product_id"] == product2["id"]
    assert updated["items"][0]["quantity"] == "3.0000"


@pytest.mark.asyncio
async def test_reorder_cancelled_order_creates_draft_chain(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Salsa")
    customer = await _create_customer(client)
    order = await _create_order(client, product, customer)
    assert order["total_amount"] == "20.00"

    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "cancelled"})
    assert r.status_code == 200

    r = await client.post(f"/api/v1/orders/{order['id']}/reorder")
    assert r.status_code == 201, r.text
    reorder = r.json()
    assert reorder["status"] == "draft"
    assert reorder["reorder_of_id"] == order["id"]
    assert reorder["reorder_of_ref"] == order["order_ref"]
    assert reorder["reorder_attempt"] == 1
    assert reorder["customer_id"] == customer["id"]
    assert reorder["total_amount"] == "20.00"
    assert len(reorder["items"]) == 1

    # The cancelled original is untouched — its history is preserved.
    r = await client.get(f"/api/v1/orders/{order['id']}")
    assert r.status_code == 200
    cancelled = r.json()
    assert cancelled["status"] == "cancelled"
    assert cancelled["reorder_of_id"] is None
    assert cancelled["reorder_attempt"] is None

    # Both are visible in the list.
    r = await client.get("/api/v1/orders")
    ids = [o["id"] for o in r.json()]
    assert order["id"] in ids and reorder["id"] in ids


@pytest.mark.asyncio
async def test_reorder_repeated_cancellations_increment_attempt(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Guac")
    order = await _create_order(client, product)
    await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "cancelled"})

    current = order
    for attempt in range(1, 4):
        r = await client.post(f"/api/v1/orders/{current['id']}/reorder")
        assert r.status_code == 201, r.text
        reorder = r.json()
        # Each reorder is itself cancelled before the next one, so the
        # history shows "once, twice, three times".
        await client.patch(
            f"/api/v1/orders/{reorder['id']}", json={"status": "cancelled"}
        )
        assert reorder["reorder_attempt"] == attempt
        assert reorder["reorder_of_id"] == current["id"]
        current = reorder

    r = await client.get("/api/v1/orders")
    ids = [o["id"] for o in r.json()]
    assert order["id"] in ids
    assert current["id"] in ids
    assert len(ids) == 4


@pytest.mark.asyncio
async def test_reorder_only_allowed_for_failed_or_cancelled(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Ketchup")
    order = await _create_order(client, product)

    r = await client.post(f"/api/v1/orders/{order['id']}/reorder")
    assert r.status_code == 409

    await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "confirmed"})
    r = await client.post(f"/api/v1/orders/{order['id']}/reorder")
    assert r.status_code == 409

    await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "ready"})
    r = await client.post(f"/api/v1/orders/{order['id']}/reorder")
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_reorder_requires_manage_catalog_permission(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    product = await _create_product(client, "Mayo")
    order = await _create_order(client, product)
    await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "cancelled"})

    delivery_id = await _create_role_user(
        tenant_id, "delivery", f"d{uuid.uuid4().hex[:6]}@test.com"
    )
    client.cookies["access_token"] = create_access_token(delivery_id, tenant_id)
    r = await client.post(f"/api/v1/orders/{order['id']}/reorder")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_reorder_reserves_stock_again(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Chilli")
    order = await _create_order(client, product)
    await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "cancelled"})

    r = await client.post(f"/api/v1/orders/{order['id']}/reorder")
    assert r.status_code == 201

    # Cancelled order returned its 2 units; the reorder reserved them again.
    r = await client.get(f"/api/v1/products/{product['id']}")
    assert r.status_code == 200
    variant = r.json()["variants"][0]
    assert float(variant["stock_quantity"]) == 98


@pytest.mark.asyncio
async def test_list_orders_filtered_by_customer(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Chilli")
    customer_a = await _create_customer(client, "Alpha")
    customer_b = await _create_customer(client, "Beta")

    order_a = await _create_order(client, product, customer_a)
    await _create_order(client, product, customer_b)

    r = await client.get(f"/api/v1/orders?customer_id={customer_a['id']}")
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()]
    assert order_a["id"] in ids
    assert all(o["customer_id"] == customer_a["id"] for o in r.json())
