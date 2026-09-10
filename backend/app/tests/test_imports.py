import uuid

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


@pytest.mark.asyncio
async def test_submit_import_creates_transactions_and_records_errors(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]

    # create a product so the import can reference it by SKU
    sku = f"SKU-{uuid.uuid4().hex[:6]}"
    r = await client.post(
        "/api/v1/products",
        json={
            "name": "Widget",
            "sku": sku,
            "variants": [
                {"name": "Default", "prices": [{"price": "10.00"}]}
            ],
        },
    )
    assert r.status_code == 201, r.text

    rows = [
        # valid sale, single string decimals, auto-creates a customer
        {
            "type": "sale",
            "transaction_date": "2026-05-01T12:00:00Z",
            "external_id": f"IMP-{uuid.uuid4().hex[:8]}",
            "amount": "100.00",
            "customer_email": f"imp{uuid.uuid4().hex[:8]}@x.com",
            "currency": "USD",
        },
        # valid purchase referencing product by SKU
        {
            "type": "purchase",
            "transaction_date": "2026-05-02T12:00:00Z",
            "external_id": f"IMP-{uuid.uuid4().hex[:8]}",
            "amount": "50.00",
            "product_sku": sku,
            "quantity": "2",
        },
        # invalid amount -> row error
        {
            "type": "sale",
            "transaction_date": "2026-05-03T12:00:00Z",
            "external_id": f"IMP-{uuid.uuid4().hex[:8]}",
            "amount": "not-a-number",
        },
    ]

    r = await client.post("/api/v1/imports", json={"rows": rows, "filename": "may.csv"})
    assert r.status_code == 201, r.text
    batch = r.json()
    assert batch["tenant_id"] == tenant_id
    assert batch["total_rows"] == 3
    assert batch["success_count"] == 2
    assert batch["error_count"] == 1
    assert batch["status"] == "completed"
    batch_id = batch["id"]

    r = await client.get(f"/api/v1/imports/{batch_id}")
    assert r.status_code == 200
    assert r.json()["id"] == batch_id

    r = await client.get(f"/api/v1/imports/{batch_id}/errors")
    assert r.status_code == 200
    errors = r.json()
    assert len(errors) == 1
    assert "invalid decimal" in errors[0]["message"]

    r = await client.get("/api/v1/transactions?limit=50&offset=0")
    ids = [t["id"] for t in r.json()]
    assert len(ids) >= 2


@pytest.mark.asyncio
async def test_import_requires_permission(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    client.cookies.clear()
    # unauthenticated -> 401
    r = await client.post(
        "/api/v1/imports",
        json={
            "rows": [
                {
                    "type": "sale",
                    "transaction_date": "2026-01-01T00:00:00Z",
                    "amount": "1.00",
                }
            ]
        },
    )
    assert r.status_code == 401
