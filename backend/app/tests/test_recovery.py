import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update


async def _register(client, slug):
    suffix = uuid.uuid4().hex[:6]
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": f"{slug} {suffix}",
            "tenant_slug": f"{slug}{suffix}",
            "email": f"{slug}{suffix}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Test Owner",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_product(client):
    r = await client.post(
        "/api/v1/products",
        json={
            "name": "Recovery Sauce",
            "variants": [
                {
                    "name": "Default",
                    "sku": f"REC-{uuid.uuid4().hex[:6]}",
                    "stock_quantity": 10,
                    "prices": [{"price": "10.00"}],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_customer(client):
    r = await client.post(
        "/api/v1/customers",
        json={"name": "Recovery Co", "email": f"rec-{uuid.uuid4().hex[:6]}@test.com"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_order(client, product, customer):
    r = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["id"],
            "delivery_address": "123 Main St",
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "2",
                    "unit_price": "10.00",
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _items(client, entity_type):
    r = await client.get(f"/api/v1/recovery?entity_type={entity_type}&limit=100")
    assert r.status_code == 200, r.text
    return r.json()["items"]


@pytest.mark.asyncio
async def test_customer_delete_cascades_to_recovery_and_restore(client):
    await _register(client, "rec")
    customer = await _create_customer(client)
    product = await _create_product(client)
    order = await _create_order(client, product, customer)

    r = await client.delete(f"/api/v1/customers/{customer['id']}")
    assert r.status_code == 204, r.text

    assert (await client.get(f"/api/v1/customers/{customer['id']}")).status_code == 404
    assert (await client.get(f"/api/v1/orders/{order['id']}")).status_code == 404

    customers = await _items(client, "customer")
    orders = await _items(client, "order")
    khatas = await _items(client, "khata")
    assert any(i["entity_id"] == customer["id"] for i in customers)
    assert any(i["entity_id"] == order["id"] for i in orders)
    assert any(i["entity_id"] == order["id"] for i in khatas)

    order_item = next(i for i in orders if i["entity_id"] == order["id"])
    r = await client.post(f"/api/v1/recovery/{order_item['id']}/restore")
    assert r.status_code == 409, r.text

    customer_item = next(i for i in customers if i["entity_id"] == customer["id"])
    r = await client.post(f"/api/v1/recovery/{customer_item['id']}/restore")
    assert r.status_code == 200, r.text

    assert (await client.get(f"/api/v1/customers/{customer['id']}")).status_code == 200
    assert (await client.get(f"/api/v1/orders/{order['id']}")).status_code == 200
    assert await _items(client, "customer") == []


@pytest.mark.asyncio
async def test_product_delete_cascades_variants_and_restore_order(client):
    await _register(client, "rec")
    product = await _create_product(client)
    variant_id = product["variants"][0]["id"]

    r = await client.delete(f"/api/v1/products/{product['id']}")
    assert r.status_code == 204, r.text

    variants = await _items(client, "variant")
    variant_item = next(i for i in variants if i["entity_id"] == variant_id)

    r = await client.post(f"/api/v1/recovery/{variant_item['id']}/restore")
    assert r.status_code == 409, r.text
    assert "first before restoring" in r.json()["detail"].lower()

    products = await _items(client, "product")
    product_item = next(i for i in products if i["entity_id"] == product["id"])
    r = await client.post(f"/api/v1/recovery/{product_item['id']}/restore")
    assert r.status_code == 200, r.text

    assert (await client.get(f"/api/v1/products/{product['id']}")).status_code == 200
    assert await _items(client, "variant") == []


@pytest.mark.asyncio
async def test_admin_keeps_items_beyond_user_recovery_window(client):
    tokens = await _register(client, "rec")
    product = await _create_product(client)

    r = await client.delete(f"/api/v1/products/{product['id']}")
    assert r.status_code == 204, r.text

    from app.core.database import get_session
    from app.modules.recovery.models import RecoveryItem
    from app.modules.users.models import User

    tenant_id = uuid.UUID(tokens["tenant_id"])
    expired = datetime.now(UTC) - timedelta(days=3)
    async with get_session() as session:
        await session.execute(
            update(User).where(User.is_superadmin.is_(True)).values(is_superadmin=False)
        )
        user = (
            await session.execute(select(User).where(User.tenant_id == tenant_id))
        ).scalars().first()
        user.is_superadmin = True
        items = (
            await session.execute(
                select(RecoveryItem).where(RecoveryItem.tenant_id == tenant_id)
            )
        ).scalars().all()
        for item in items:
            item.deleted_at = expired
        await session.commit()

    assert await _items(client, "product") == []
    r = await client.get("/api/v1/recovery?entity_type=product&admin_scope=true&limit=100")
    assert r.status_code == 200, r.text
    admin_items = r.json()["items"]
    assert admin_items
    assert admin_items[0]["can_restore"] is True
    assert admin_items[0]["expires_at"] > admin_items[0]["deleted_at"]
