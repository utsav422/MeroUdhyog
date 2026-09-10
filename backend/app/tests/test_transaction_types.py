import uuid

import pytest


async def _register(client, slug):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": slug,
            "email": f"{slug}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Test Owner",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_register_seeds_default_transaction_types(client):
    await _register(client, f"ttseed{uuid.uuid4().hex[:6]}")
    r = await client.get("/api/v1/transaction-types")
    assert r.status_code == 200
    codes = {t["code"] for t in r.json()}
    assert codes == {"sale", "purchase", "expense"}


@pytest.mark.asyncio
async def test_crud_and_use_custom_transaction_type(client):
    await _register(client, f"tt{uuid.uuid4().hex[:6]}")

    r = await client.post(
        "/api/v1/transaction-types", json={"name": "Cash", "code": "cash"}
    )
    assert r.status_code == 201
    created = r.json()
    assert created["code"] == "cash"

    dup = await client.post(
        "/api/v1/transaction-types", json={"name": "Cash Again", "code": "cash"}
    )
    assert dup.status_code == 409

    bad = await client.post(
        "/api/v1/transaction-types", json={"name": "Bad", "code": "Not Valid!"}
    )
    assert bad.status_code == 422

    patched = await client.patch(
        f"/api/v1/transaction-types/{created['id']}", json={"name": "Cash Ledger"}
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Cash Ledger"

    listed = await client.get("/api/v1/transaction-types")
    assert listed.status_code == 200
    assert created["id"] in [t["id"] for t in listed.json()]

    tx = await client.post(
        "/api/v1/transactions",
        json={
            "type": "cash",
            "transaction_date": "2026-09-02T10:00:00+05:45",
            "amount": "500",
            "currency": "NPR",
            "metadata": {},
        },
    )
    assert tx.status_code == 201, tx.text
    assert tx.json()["type"] == "cash"

    deleted = await client.delete(f"/api/v1/transaction-types/{created['id']}")
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_transaction_with_undefined_type_is_rejected(client):
    await _register(client, f"tt{uuid.uuid4().hex[:6]}")
    r = await client.post(
        "/api/v1/transactions",
        json={
            "type": "credit",
            "transaction_date": "2026-09-02T10:00:00+05:45",
            "amount": "1",
            "metadata": {},
        },
    )
    assert r.status_code == 422
    assert "not defined" in r.json()["detail"]
