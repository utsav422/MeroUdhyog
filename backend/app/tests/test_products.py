import uuid

import pytest

from app.core.database import get_session
from app.core.security import create_access_token, get_password_hash
from app.modules.users.models import User

PRODUCT_PAYLOAD = {
    "name": "Widget Pro",
    "description": "A rugged industrial widget",
    "sku": "WIDG-PRO",
    "category": "hardware",
    "variants": [
        {
            "name": "Large",
            "attributes": {"size": "L", "finish": "matte"},
            "sort_order": 1,
            "prices": [
                {
                    "price": "19.99",
                    "currency": "USD",
                    "effective_from": "2026-01-01T00:00:00Z",
                }
            ],
        }
    ],
}


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


async def _create_user(tenant_id, role):
    email = f"_{uuid.uuid4().hex[:8]}@test.com"
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
    return user_id, email


async def _create_product(client):
    payload = dict(PRODUCT_PAYLOAD)
    payload["sku"] = f"SKU-{uuid.uuid4().hex[:8]}"
    return payload


@pytest.mark.asyncio
async def test_owner_can_create_list_get_patch_delete_product(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]

    payload = await _create_product(client)
    r = await client.post("/api/v1/products", json=payload)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["name"] == "Widget Pro"
    assert created["tenant_id"] == tenant_id
    assert len(created["variants"]) == 1
    variant = created["variants"][0]
    assert variant["name"] == "Large"
    assert variant["product_id"] == created["id"]
    assert variant["attributes"]["size"] == "L"
    assert len(variant["prices"]) == 1
    pid = created["id"]

    r = await client.get(f"/api/v1/products/{pid}")
    assert r.status_code == 200
    assert r.json()["id"] == pid

    r = await client.get("/api/v1/products?limit=10&offset=0")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert pid in ids

    r = await client.patch(f"/api/v1/products/{pid}", json={"name": "Widget Pro XL"})
    assert r.status_code == 200
    assert r.json()["name"] == "Widget Pro XL"

    r = await client.delete(f"/api/v1/products/{pid}")
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_duplicate_sku_conflict(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    payload = await _create_product(client)
    first = await client.post("/api/v1/products", json=payload)
    assert first.status_code == 201, first.text
    dup = await client.post("/api/v1/products", json=payload)
    assert dup.status_code == 409


@pytest.mark.asyncio
async def test_no_auth_unauthorized(client):
    r = await client.get("/api/v1/products")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_accountant_and_viewer_read_but_cannot_write(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]

    owner = await client.post("/api/v1/products", json=await _create_product(client))
    assert owner.status_code == 201, owner.text
    pid = owner.json()["id"]

    for role in ("accountant", "viewer"):
        user_id, _ = await _create_user(tenant_id, role)
        token = create_access_token(user_id, tenant_id)
        client.cookies["access_token"] = token

        r = await client.get(f"/api/v1/products/{pid}")
        assert r.status_code == 200, f"{role} should read"

        for method in ("post", "patch", "delete"):
            if method == "post":
                response = await client.post("/api/v1/products", json=await _create_product(client))
            elif method == "patch":
                response = await client.patch(f"/api/v1/products/{pid}", json={"name": "x"})
            else:
                response = await client.delete(f"/api/v1/products/{pid}")
            assert response.status_code == 403, f"{role} {method} should be forbidden"


@pytest.mark.asyncio
async def test_patch_variant_and_variant_price(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    payload = await _create_product(client)
    r = await client.post("/api/v1/products", json=payload)
    assert r.status_code == 201, r.text
    product = r.json()
    pid = product["id"]
    variant = product["variants"][0]
    vid = variant["id"]
    price_id = variant["prices"][0]["id"]

    r = await client.patch(
        f"/api/v1/products/{pid}/variants/{vid}",
        json={"name": "Large XL", "size": "XXL", "size_type": "clothing"},
    )
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["name"] == "Large XL"
    assert updated["size"] == "XXL"
    assert updated["size_type"] == "clothing"

    r = await client.patch(
        f"/api/v1/products/{pid}/variants/{vid}/prices/{price_id}",
        json={"price": "25.50", "cost_price": "15.00"},
    )
    assert r.status_code == 200, r.text
    price = r.json()
    assert price["price"] == "25.50"
    assert price["cost_price"] == "15.00"

    r = await client.get(f"/api/v1/products/{pid}")
    assert r.status_code == 200
    fetched_variant = r.json()["variants"][0]
    assert fetched_variant["name"] == "Large XL"
    assert fetched_variant["prices"][0]["price"] == "25.50"


@pytest.mark.asyncio
async def test_delete_variant_rejects_last_remaining_variant(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await client.post("/api/v1/products", json=await _create_product(client))
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    vid = r.json()["variants"][0]["id"]

    r = await client.delete(f"/api/v1/products/{pid}/variants/{vid}")
    assert r.status_code == 409
    assert "at least one variant" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_delete_variant_removed_from_product(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    payload = await _create_product(client)
    payload["variants"][0]["name"] = "Keep"
    r = await client.post(
        "/api/v1/products",
        json={
            **payload,
            "variants": [
                *payload["variants"],
                {
                    "name": "Delete me",
                    "sku": f"DEL-{uuid.uuid4().hex[:4]}",
                    "stock_quantity": 3,
                    "low_stock_threshold": 1,
                    "prices": [{"price": "9.99"}],
                },
            ],
        },
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    to_delete = next(v for v in r.json()["variants"] if v["name"] == "Delete me")

    r = await client.delete(f"/api/v1/products/{pid}/variants/{to_delete['id']}")
    assert r.status_code == 204

    r = await client.get(f"/api/v1/products/{pid}")
    assert r.status_code == 200
    names = [v["name"] for v in r.json()["variants"]]
    assert names == ["Keep"]
    assert "Delete me" not in names
