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
                    "size": "500ml",
                    "size_type": "volume",
                    "prices": [
                        {
                            "price": "10.00",
                            "wholesale_price": "8.00",
                            "cost_price": "6.00",
                            "mrp_price": "12.00",
                        }
                    ],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_owner_category_crud_with_auto_slug(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")

    r = await client.post("/api/v1/categories", json={"name": "Pasta & Sauces"})
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["slug"] == "pasta-sauces"
    cid = created["id"]

    r = await client.get(f"/api/v1/categories/{cid}")
    assert r.status_code == 200
    assert r.json()["id"] == cid

    r = await client.get("/api/v1/categories")
    assert r.status_code == 200
    assert cid in [c["id"] for c in r.json()]

    r = await client.patch(f"/api/v1/categories/{cid}", json={"name": "Fresh Pasta"})
    assert r.status_code == 200
    assert r.json()["slug"] == "fresh-pasta"

    r = await client.delete(f"/api/v1/categories/{cid}")
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_category_duplicate_name_conflict(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    first = await client.post("/api/v1/categories", json={"name": "Sauces"})
    assert first.status_code == 201, first.text
    dup = await client.post("/api/v1/categories", json={"name": "sauces!"})
    assert dup.status_code == 409


@pytest.mark.asyncio
async def test_viewer_cannot_create_category(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    viewer_id = await _create_role_user(
        tenant_id, "viewer", f"v{uuid.uuid4().hex[:6]}@test.com"
    )
    client.cookies["access_token"] = create_access_token(viewer_id, tenant_id)
    r = await client.post("/api/v1/categories", json={"name": "Nope"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_product_links_to_category_and_variant_enrichment(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await client.post("/api/v1/categories", json={"name": "Bottles"})
    cat = r.json()
    category_id = cat["id"]

    r = await client.post(
        "/api/v1/products",
        json={
            "name": "Tomato Sauce",
            "category_id": category_id,
            "variants": [
                {
                    "name": "Large",
                    "sku": "TS-L",
                    "size": "1L",
                    "size_type": "volume",
                    "images": ["https://example.com/a.jpg"],
                    "prices": [
                        {
                            "price": "9.99",
                            "wholesale_price": "7.00",
                            "cost_price": "5.00",
                            "mrp_price": "11.99",
                        }
                    ],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    product = r.json()
    assert product["category_id"] == category_id
    assert product["slug"] == "tomato-sauce"
    variant = product["variants"][0]
    assert variant["size"] == "1L"
    assert variant["size_type"] == "volume"
    assert variant["images"] == ["https://example.com/a.jpg"]
    price = variant["prices"][0]
    assert price["wholesale_price"] == "7.00"
    assert price["cost_price"] == "5.00"
    assert price["mrp_price"] == "11.99"


@pytest.mark.asyncio
async def test_add_variant_to_existing_product(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Olive Oil")

    r = await client.post(
        f"/api/v1/products/{product['id']}/variants",
        json={
            "name": "Small",
            "sku": "OO-S",
            "size": "250ml",
            "size_type": "volume",
            "prices": [{"price": "4.00"}],
        },
    )
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["name"] == "Small"
    assert created["product_id"] == product["id"]

    r = await client.get(f"/api/v1/products/{product['id']}")
    assert r.status_code == 200
    names = [v["name"] for v in r.json()["variants"]]
    assert "Small" in names and "Default" in names
