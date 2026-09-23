import uuid

import pytest

from app.core.security import create_access_token
from app.tests.test_customers import _register
from app.tests.test_products import _create_user

VALID_CSV = (
    "name*,email,phone,contact_number,pan_no,company,address,"
    "city,latitude,longitude,notes\n"
    "Alice Cooper,alice@acme.com,555-0100,,PAN-1001,Acme Corp,"
    "1 Factory Way,Springfield,42.123456,-71.654321,Corporate account\n"
    "Bob Ross,bob@paints.com,555-0111,,,Happy Trees LLC,2 Oak Lane,Boston,,,\n"
)

PARTIAL_CSV = (
    "name*,email,phone,contact_number,pan_no,company,address,"
    "city,latitude,longitude,notes\n"
    "Alice Cooper,alice@acme.com,555-0100,,PAN-1001,Acme Corp,"
    "1 Factory Way,Springfield,42.123456,-71.654321,Corporate account\n"
    "Alice Cooper,alice@acme.com,555-0200,,,,,,,,,\n"
    "Bad Email,not-an-email,,,,,,,,,,\n"
    + ",".join(["Bad Coords", "coords@x.com", "", "", "", "", "", "", "", "999.0", ""])
    + "\n"
    + ",".join(["", "missing", "", "", "name", "", "", "", "", "", ""])
    + "\n"
)


async def _upload(client, content: str):
    return await client.post(
        "/api/v1/customers/import",
        files={"file": ("customers.csv", content.encode("utf-8"), "text/csv")},
    )


@pytest.mark.asyncio
async def test_download_import_sample_csv(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await client.get("/api/v1/customers/import/sample")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    body = r.text
    assert "name*,email,phone,contact_number,pan_no,company" in body
    assert "Alice Cooper,alice@acme.com" in body


@pytest.mark.asyncio
async def test_upload_csv_creates_customers(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await _upload(client, VALID_CSV)
    assert r.status_code == 201, r.text
    result = r.json()
    assert result["created"] == 2
    assert result["failed"] == 0
    assert result["errors"] == []

    r = await client.get("/api/v1/customers?limit=50&offset=0")
    assert r.status_code == 200
    by_name = {c["name"]: c for c in r.json()}
    alice = by_name["Alice Cooper"]
    assert alice["email"] == "alice@acme.com"
    assert alice["company"] == "Acme Corp"
    assert alice["city"] == "Springfield"
    assert str(alice["latitude"]) == "42.123456"
    assert alice["notes"] == "Corporate account"
    assert by_name["Bob Ross"]["email"] == "bob@paints.com"


@pytest.mark.asyncio
async def test_upload_csv_reports_row_errors_and_still_imports_valid_rows(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await _upload(client, PARTIAL_CSV)
    assert r.status_code == 201, r.text
    result = r.json()
    assert result["created"] == 1
    assert result["failed"] == 4
    assert len(result["errors"]) == 4

    messages = {e["row"]: e["message"] for e in result["errors"]}
    assert "already exists" in messages[3].lower()
    assert "email" in messages[4].lower()
    assert "longitude" in messages[5].lower()
    assert "name" in messages[6].lower()


@pytest.mark.asyncio
async def test_upload_csv_missing_required_column(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await _upload(client, "email\nx@y.com\n")
    assert r.status_code == 422
    assert "name*" in r.json()["detail"]


@pytest.mark.asyncio
async def test_import_write_forbidden_for_non_customer_roles(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    user_id, _ = await _create_user(tenant_id, "accountant")
    client.cookies["access_token"] = create_access_token(user_id, tenant_id)

    r = await client.get("/api/v1/customers/import/sample")
    assert r.status_code == 200, "sample download should be readable"

    r = await _upload(client, VALID_CSV)
    assert r.status_code == 403