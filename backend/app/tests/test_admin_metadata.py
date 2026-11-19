import pytest


@pytest.mark.asyncio
async def test_admin_index_has_brand_metadata(client):
    response = await client.get("/admin")

    assert response.status_code == 200, response.text
    assert "<title>Mero Udhyog Admin</title>" in response.text
    assert 'href="/brand/favicon.svg"' in response.text
    assert 'href="/brand/apple-touch-icon.png"' in response.text
    assert (
        'name="robots" content="noindex, nofollow, noarchive"'
        in response.text
    )
    assert 'window.SERVER_URL = "/admin/api";' in response.text
    assert response.headers["x-robots-tag"] == "noindex, nofollow, noarchive"


@pytest.mark.asyncio
async def test_admin_brand_assets_are_served(client):
    for path in (
        "/brand/favicon.svg",
        "/brand/favicon.ico",
        "/brand/apple-touch-icon.png",
        "/brand/logo-lockup.svg",
        "/brand/logo-lockup-dark.svg",
    ):
        response = await client.get(path)
        assert response.status_code == 200, path
        assert response.content, path


@pytest.mark.asyncio
async def test_admin_manifest_uses_admin_scope(client):
    response = await client.get("/admin/manifest.webmanifest")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Mero Udhyog Admin"
    assert body["start_url"] == "/admin"
    assert body["scope"] == "/admin"
    assert body["theme_color"] == "#27675c"
