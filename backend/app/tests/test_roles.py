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


@pytest.mark.asyncio
async def test_default_roles_seeded_on_register(client):
    await _register(client, "roleseed")
    r = await client.get("/api/v1/roles")
    assert r.status_code == 200
    roles = r.json()
    codes = {x["code"] for x in roles}
    assert {"owner", "admin", "manager", "accountant", "worker", "delivery", "viewer"} <= codes
    owner = next(x for x in roles if x["code"] == "owner")
    assert owner["is_system"] is True
    assert "manage_users" in owner["permissions"]


@pytest.mark.asyncio
async def test_create_custom_role_with_permissions(client):
    await _register(client, "rolecrud")
    r = await client.post(
        "/api/v1/roles",
        json={
            "name": "Sales Rep",
            "code": "sales_rep",
            "description": "Can manage orders",
            "permissions": ["view_all", "manage_orders"],
        },
    )
    assert r.status_code == 201, r.text
    role = r.json()
    assert role["code"] == "sales_rep"
    assert set(role["permissions"]) == {"view_all", "manage_orders"}
    assert role["is_system"] is False

    r = await client.post(
        "/api/v1/roles",
        json={"name": "Sales Rep 2", "code": "sales_rep", "permissions": []},
    )
    assert r.status_code == 409

    r = await client.post(
        "/api/v1/roles",
        json={"name": "Bad", "code": "bad", "permissions": ["not_a_perm"]},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_system_role_cannot_be_modified_or_deleted(client):
    await _register(client, "rolesys")
    roles = (await client.get("/api/v1/roles")).json()
    owner = next(x for x in roles if x["code"] == "owner")

    r = await client.patch(
        f"/api/v1/roles/{owner['id']}", json={"permissions": ["view_all"]}
    )
    assert r.status_code == 403

    r = await client.delete(f"/api/v1/roles/{owner['id']}")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_role_permissions_drive_authorization(client):
    tokens = await _register(client, "roleauth")
    tenant_id = tokens["tenant_id"]
    agent_id = await _create_role_user(
        tenant_id, "delivery", f"roleauth{uuid.uuid4().hex[:6]}@test.com"
    )

    from app.core.security import create_access_token

    client.cookies["access_token"] = create_access_token(agent_id, tenant_id)

    r = await client.get("/api/v1/deliveries")
    assert r.status_code == 200

    r = await client.post("/api/v1/orders", json={"items": []})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_can_create_user_with_custom_role(client):
    await _register(client, "roleuser")
    r = await client.post(
        "/api/v1/roles",
        json={
            "name": "Field Agent",
            "code": "field_agent",
            "permissions": ["view_assigned_deliveries", "update_delivery_status"],
        },
    )
    assert r.status_code == 201

    r = await client.post(
        "/api/v1/users",
        json={
            "email": f"field{uuid.uuid4().hex[:6]}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Field Agent",
            "role": "field_agent",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "field_agent"


@pytest.mark.asyncio
async def test_cannot_create_user_with_unknown_role(client):
    await _register(client, "rolebad")
    r = await client.post(
        "/api/v1/users",
        json={
            "email": f"bad{uuid.uuid4().hex[:6]}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Bad",
            "role": "not_a_real_role",
        },
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_role_tenant_isolation(client):
    await _register(client, "roleiso1")
    r = await client.post(
        "/api/v1/roles",
        json={"name": "Custom", "code": "custom", "permissions": ["view_all"]},
    )
    assert r.status_code == 201
    first_id = r.json()["id"]

    await _register(client, "roleiso2")
    r = await client.get("/api/v1/roles")
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert first_id not in ids
    assert "custom" not in {x["code"] for x in r.json()}
