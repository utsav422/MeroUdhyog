import uuid

import pytest


async def _register(client, slug):
    email = f"{slug}{uuid.uuid4().hex[:6]}@test.com"
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": f"{slug}{uuid.uuid4().hex[:8]}",
            "email": email,
            "password": "Sup3rSecret!2026",
            "full_name": "Test Owner",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_user(tenant_id, role, is_superadmin, email):
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
            is_superadmin=is_superadmin,
            is_active=True,
        )
        session.add(user)
        await session.flush()
        user_id = user.id
    return user_id


async def _reset_superadmins():
    from sqlalchemy import text

    from app.core.database import get_session

    async with get_session() as session:
        await session.execute(text("UPDATE users SET is_superadmin=false WHERE is_superadmin"))
        await session.flush()


@pytest.mark.asyncio
async def test_superadmin_bypasses_permissions_across_tenants(client):
    # A delivery-role user in one tenant cannot create orders in another.
    tokens = await _register(client, "superadmauth")
    tenant_id = tokens["tenant_id"]
    other = await _register(client, "superadmoth")

    from app.core.security import create_access_token

    # Clear any prior superadmin so this test can own the single slot.
    await _reset_superadmins()

    # Superadmin lives in one tenant but has weak role 'delivery'.
    sa_id = await _create_user(tenant_id, "delivery", True, f"sa{uuid.uuid4().hex[:6]}@test.com")
    client.cookies["access_token"] = create_access_token(sa_id, other["tenant_id"])

    r = await client.post(
        "/api/v1/orders",
        json={"items": [{"product_id": str(uuid.uuid4()), "qty": 1}]},
    )
    # Permission check passes (superadmin bypass), so we do NOT get 403.
    assert r.status_code != 403

    r = await client.get("/api/v1/users")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_non_superadmin_weak_role_still_blocked(client):
    # A plain delivery-role user (non-superadmin) cannot create orders.
    tokens = await _register(client, "superadmblk")
    from app.core.security import create_access_token

    uid = await _create_user(
        tokens["tenant_id"], "delivery", False, f"plain{uuid.uuid4().hex[:6]}@test.com"
    )
    client.cookies["access_token"] = create_access_token(uid, tokens["tenant_id"])
    r = await client.post("/api/v1/orders", json={"items": []})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_me_exposes_is_superadmin(client):
    await _register(client, "superadmme")
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert "is_superadmin" in body
    assert isinstance(body["is_superadmin"], bool)


@pytest.mark.asyncio
async def test_register_single_superadmin(client):
    # Registering a brand-new tenant creator must be superadmin if (and only if)
    # no superadmin exists yet. Assert: non-superadmin never happens twice in a
    # row -> i.e. the flag is True the first time there is no existing superadmin.
    from sqlalchemy import func, select

    from app.core.database import get_session
    from app.modules.users.models import User

    # Deterministic: start from a state with no superadmin.
    await _reset_superadmins()

    async with get_session() as session:
        existing = (
            await session.execute(
                select(func.count()).select_from(User).where(User.is_superadmin.is_(True))
            )
        ).scalar_one()

    await _register(client, "superadmsgl")
    r = await client.get("/api/v1/auth/me")
    actual = r.json()["is_superadmin"]
    # A fresh superadmin should only appear when none existed before.
    if existing == 0:
        assert actual is True
    else:
        assert actual is False

    async with get_session() as session:
        total = (
            await session.execute(
                select(func.count()).select_from(User).where(User.is_superadmin.is_(True))
            )
        ).scalar_one()
    # There must never be more than one superadmin.
    assert total <= 1
