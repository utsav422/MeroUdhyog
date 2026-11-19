import uuid

import pytest

PNG_BYTES = b"\x89PNG\r\n\x1a\nprofile-avatar"


async def _register(client):
    suffix = uuid.uuid4().hex[:8]
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": f"Profile {suffix}",
            "tenant_slug": f"profile-{suffix}",
            "email": f"profile-{suffix}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Profile Owner",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_profile_requires_authentication(client):
    r = await client.get("/api/v1/users/me")
    assert r.status_code == 401, r.text


@pytest.mark.asyncio
async def test_get_and_update_profile(client):
    await _register(client)

    r = await client.get("/api/v1/users/me")
    assert r.status_code == 200, r.text
    profile = r.json()
    assert profile["full_name"] == "Profile Owner"
    assert profile["avatar_url"] is None
    assert profile["latitude"] is None
    assert profile["longitude"] is None

    r = await client.patch(
        "/api/v1/users/me",
        json={
            "full_name": "Updated Owner",
            "latitude": "27.717245",
            "longitude": "85.323961",
        },
    )
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["full_name"] == "Updated Owner"
    assert float(updated["latitude"]) == pytest.approx(27.717245)
    assert float(updated["longitude"]) == pytest.approx(85.323961)

    r = await client.patch(
        "/api/v1/users/me",
        json={"latitude": None, "longitude": None},
    )
    assert r.status_code == 200, r.text
    assert r.json()["latitude"] is None
    assert r.json()["longitude"] is None


@pytest.mark.asyncio
async def test_profile_rejects_incomplete_or_out_of_range_location(client):
    await _register(client)

    r = await client.patch("/api/v1/users/me", json={"latitude": "27.7"})
    assert r.status_code == 422, r.text

    r = await client.patch(
        "/api/v1/users/me",
        json={"latitude": "91", "longitude": "85"},
    )
    assert r.status_code == 422, r.text

    r = await client.patch(
        "/api/v1/users/me",
        json={"latitude": "27", "longitude": "181"},
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_avatar_upload_serves_and_deletes(client):
    await _register(client)

    r = await client.post(
        "/api/v1/users/me/avatar",
        files={"file": ("avatar.png", PNG_BYTES, "image/png")},
    )
    assert r.status_code == 200, r.text
    avatar_url = r.json()["avatar_url"]
    assert avatar_url and avatar_url.startswith("/users/me/avatar?v=")

    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 200, r.text
    assert r.json()["avatar_url"] == avatar_url

    r = await client.get("/api/v1/users/me/avatar")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png"
    assert r.content == PNG_BYTES

    r = await client.delete("/api/v1/users/me/avatar")
    assert r.status_code == 204, r.text

    r = await client.get("/api/v1/users/me/avatar")
    assert r.status_code == 404, r.text

    r = await client.get("/api/v1/users/me")
    assert r.json()["avatar_url"] is None


@pytest.mark.asyncio
async def test_avatar_rejects_invalid_type_and_empty_file(client):
    await _register(client)

    r = await client.post(
        "/api/v1/users/me/avatar",
        files={"file": ("avatar.txt", b"not an image", "text/plain")},
    )
    assert r.status_code == 422, r.text

    r = await client.post(
        "/api/v1/users/me/avatar",
        files={"file": ("avatar.png", b"", "image/png")},
    )
    assert r.status_code == 422, r.text
