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


async def _create_user(session_ctx, tenant_id, role, email):
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


CUSTOMER_PAYLOAD = {
    "name": "Acme Corp",
    "email": "billing@acme.com",
    "phone": "555-0100",
    "company": "Acme",
    "address": "1 Factory Way",
}


@pytest.mark.asyncio
async def test_owner_can_create_list_get_patch_delete_customer(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]

    r = await client.post("/api/v1/customers", json=CUSTOMER_PAYLOAD)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["name"] == "Acme Corp"
    assert created["tenant_id"] == tenant_id
    cid = created["id"]

    r = await client.get(f"/api/v1/customers/{cid}")
    assert r.status_code == 200
    assert r.json()["id"] == cid

    r = await client.get("/api/v1/customers?limit=10&offset=0")
    assert r.status_code == 200
    assert cid in [c["id"] for c in r.json()]

    r = await client.patch(f"/api/v1/customers/{cid}", json={"name": "Acme Corp Ltd"})
    assert r.status_code == 200
    assert r.json()["name"] == "Acme Corp Ltd"

    r = await client.delete(f"/api/v1/customers/{cid}")
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_duplicate_email_conflict(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    payload = dict(CUSTOMER_PAYLOAD)
    payload["email"] = f"dup{uuid.uuid4().hex[:8]}@acme.com"
    first = await client.post("/api/v1/customers", json=payload)
    assert first.status_code == 201, first.text
    dup = await client.post("/api/v1/customers", json=payload)
    assert dup.status_code == 409


@pytest.mark.asyncio
async def test_no_auth_unauthorized(client):
    r = await client.get("/api/v1/customers")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_viewer_read_but_cannot_write(client):
    from app.core.database import get_session

    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    await client.post("/api/v1/customers", json=CUSTOMER_PAYLOAD)

    viewer_id = await _create_user(
        get_session, tenant_id, "viewer", f"v{uuid.uuid4().hex[:6]}@test.com"
    )
    client.cookies["access_token"] = create_access_token(viewer_id, tenant_id)

    r = await client.get("/api/v1/customers")
    assert r.status_code == 200

    r = await client.post("/api/v1/customers", json=CUSTOMER_PAYLOAD)
    assert r.status_code == 403
