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


async def _create_product(client, name, stock=10, threshold=5):
    r = await client.post(
        "/api/v1/products",
        json={
            "name": name,
            "variants": [
                {
                    "name": "Default",
                    "sku": f"VAR-{name}-{uuid.uuid4().hex[:4]}",
                    "stock_quantity": stock,
                    "low_stock_threshold": threshold,
                    "prices": [{"price": "10.00"}],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_order(client, product, quantity="2"):
    r = await client.post(
        "/api/v1/orders",
        json={
            "delivery_address": "123 Main St",
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": quantity,
                    "unit_price": "10.00",
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _get_variant_stock(client, product):
    r = await client.get(f"/api/v1/products/{product['id']}")
    assert r.status_code == 200
    return r.json()["variants"][0]["stock_quantity"]


@pytest.mark.asyncio
async def test_order_create_deducts_stock_and_records_movement(client):
    await _register(client, "t")
    product = await _create_product(client, "Sauce")
    await _create_order(client, product, "2")
    assert await _get_variant_stock(client, product) == 8

    movements = await client.get("/api/v1/products/inventory/movements?limit=10")
    assert movements.status_code == 200
    body = movements.json()
    assert len(body) == 1
    assert body[0]["product_name"] == "Sauce"
    assert body[0]["variant_name"] == "Default"
    assert body[0]["quantity"] == -2
    assert body[0]["reason"] == "order"


@pytest.mark.asyncio
async def test_order_over_stock_is_rejected_without_partial_deduction(client):
    await _register(client, "t")
    product = await _create_product(client, "Sauce", stock=5)
    r = await client.post(
        "/api/v1/orders",
        json={
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "6",
                    "unit_price": "10.00",
                }
            ],
        },
    )
    assert r.status_code == 409, r.text
    assert "only 5 available" in r.json()["detail"].lower()
    assert await _get_variant_stock(client, product) == 5


@pytest.mark.asyncio
async def test_product_without_variants_is_rejected(client):
    await _register(client, "t")
    r = await client.post(
        "/api/v1/products",
        json={"name": "NoVariant", "variants": []},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_low_stock_endpoint_lists_variants_below_threshold(client):
    await _register(client, "t")
    await _create_product(client, "Pickle", stock=2, threshold=5)
    await _create_product(client, "Ketchup", stock=20, threshold=5)

    r = await client.get("/api/v1/products/inventory/low?limit=10")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["product_name"] == "Pickle"
    assert body[0]["stock_quantity"] == 2
    assert body[0]["low_stock_threshold"] == 5


@pytest.mark.asyncio
async def test_editing_order_items_rebalances_stock(client):
    await _register(client, "t")
    product = await _create_product(client, "Sauce", stock=10)
    order = await _create_order(client, product, "4")
    assert await _get_variant_stock(client, product) == 6

    r = await client.patch(
        f"/api/v1/orders/{order['id']}",
        json={
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "2",
                    "unit_price": "10.00",
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    assert await _get_variant_stock(client, product) == 8


@pytest.mark.asyncio
async def test_cancelling_order_restores_stock(client):
    await _register(client, "t")
    product = await _create_product(client, "Sauce", stock=10)
    order = await _create_order(client, product, "4")
    assert await _get_variant_stock(client, product) == 6

    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "cancelled"})
    assert r.status_code == 200, r.text
    assert await _get_variant_stock(client, product) == 10


@pytest.mark.asyncio
async def test_deleting_draft_order_restores_stock(client):
    await _register(client, "t")
    product = await _create_product(client, "Sauce", stock=10)
    order = await _create_order(client, product, "3")
    assert await _get_variant_stock(client, product) == 7

    r = await client.delete(f"/api/v1/orders/{order['id']}")
    assert r.status_code == 204
    assert await _get_variant_stock(client, product) == 10


@pytest.mark.asyncio
async def test_csv_import_sets_stock_quantities(client):
    await _register(client, "t")
    csv_body = (
        "name*,variant*,price*,sku,stock_quantity,low_stock_threshold\n"
        "Chutney,Classic,5.50,CH-500,120,20\n"
    )
    r = await client.post(
        "/api/v1/products/import",
        files={"file": ("import.csv", csv_body, "text/csv")},
    )
    assert r.status_code == 201, r.text
    assert r.json()["created"] == 1

    products = await client.get("/api/v1/products?limit=10")
    assert products.status_code == 200
    product = next(p for p in products.json() if p["name"] == "Chutney")
    variant = product["variants"][0]
    assert variant["stock_quantity"] == 120
    assert variant["low_stock_threshold"] == 20