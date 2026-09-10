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


def _tx(**overrides):
    base = {
        "type": "sale",
        "transaction_date": "2026-05-01T12:00:00Z",
        "amount": "150.00",
        "external_id": f"EXT-{uuid.uuid4().hex[:8]}",
        "currency": "USD",
        "description": "widget sale",
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_owner_can_create_list_get_patch_delete_transaction(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]

    r = await client.post("/api/v1/transactions", json=_tx())
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["type"] == "sale"
    assert created["amount"] == "150.00"
    assert created["tenant_id"] == tenant_id
    txid = created["id"]

    r = await client.get(f"/api/v1/transactions/{txid}")
    assert r.status_code == 200
    assert r.json()["id"] == txid

    r = await client.get("/api/v1/transactions?type=sale&limit=10&offset=0")
    assert r.status_code == 200
    assert txid in [t["id"] for t in r.json()]

    r = await client.patch(f"/api/v1/transactions/{txid}", json={"description": "updated"})
    assert r.status_code == 200
    assert r.json()["description"] == "updated"

    r = await client.post(f"/api/v1/transactions/{txid}/reverse")
    assert r.status_code == 200
    reversal = r.json()
    assert reversal["reverses_id"] == txid

    r = await client.delete(f"/api/v1/transactions/{txid}")
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_external_id_must_be_unique(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    payload = _tx(external_id="DUP-EXT")
    first = await client.post("/api/v1/transactions", json=payload)
    assert first.status_code == 201, first.text
    dup = await client.post("/api/v1/transactions", json=payload)
    assert dup.status_code == 409


@pytest.mark.asyncio
async def test_cannot_reference_other_tenants_customer(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    a_customer = (
        await client.post(
            "/api/v1/customers",
            json={"name": "TenantA-Customer", "email": f"a{uuid.uuid4().hex[:6]}@x.com"},
        )
    ).json()
    # switch to a second tenant
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await client.post(
        "/api/v1/transactions",
        json=_tx(customer_id=a_customer["id"]),
    )
    assert r.status_code == 422, r.text
