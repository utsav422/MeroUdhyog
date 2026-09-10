import uuid

import pytest

from app.core.database import get_session
from app.core.security import get_password_hash
from app.modules.users.models import User


async def _register(client, slug):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": slug,
            "email": f"{slug}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Test Owner",
            "role": "owner",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_user(tenant_id, role, email):
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
async def test_list_users_requires_and_returns_tenant_users(client):
    reg = await _register(client, f"u{uuid.uuid4().hex[:6]}")
    tenant_id = reg["tenant_id"]

    agent_id = await _create_user(tenant_id, "delivery", f"agent{uuid.uuid4().hex[:4]}@test.com")
    worker_id = await _create_user(tenant_id, "worker", f"worker{uuid.uuid4().hex[:4]}@test.com")

    r = await client.get("/api/v1/users")
    assert r.status_code == 200, r.text
    users = r.json()
    assert len(users) >= 3
    roles = {u["role"] for u in users if u["id"] == str(agent_id) or u["id"] == str(worker_id)}
    assert {"delivery", "worker"} <= roles


@pytest.mark.asyncio
async def test_viewer_can_list_but_owner_creates_via_manage_users(client):
    reg = await _register(client, f"v{uuid.uuid4().hex[:6]}")
    tenant_id = reg["tenant_id"]
    viewer_id = await _create_user(
        tenant_id, "viewer", f"view{uuid.uuid4().hex[:4]}@test.com"
    )

    # Log in as the viewer (cookie-bound auth)
    from sqlalchemy import select

    from app.core.database import get_session
    from app.modules.users.models import User

    async with get_session() as session:
        row = await session.execute(select(User).where(User.id == viewer_id))
        vemail = row.scalar_one().email
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": vemail, "password": "Sup3rSecret!2026"},
    )
    assert r.status_code == 200, r.text

    # Viewer (VIEW_ALL) can read the user list
    r = await client.get("/api/v1/users")
    assert r.status_code == 200, r.text
    roles = {u["role"] for u in r.json()}
    assert "viewer" in roles

    # Viewer cannot create users (MANAGE_USERS is required)
    r = await client.post(
        "/api/v1/users",
        json={
            "email": f"new{uuid.uuid4().hex[:4]}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "New User",
            "role": "worker",
        },
    )
    assert r.status_code == 403, r.text
