import uuid

import pytest

from app.core.security import create_access_token
from app.tests.test_products import _create_user, _register

VALID_CSV = (
    "name*,variant*,price*,sku,description,category,size,size_type,"
    "wholesale_price,cost_price,mrp_price,currency\n"
    "Mango Pickle,Classic,5.50,MANGO-500,Spicy and tangy pickle,Pickles,500,g,4.50,3.00,6.00,USD\n"
    "Lemon Pickle,Classic,6.00,LEMON-500,Citrusy lemon pickle,Pickles,,,5.00,3.50,7.00,USD\n"
)

PARTIAL_CSV = (
    "name*,variant*,price*,sku,description,category,size,size_type,"
    "wholesale_price,cost_price,mrp_price,currency\n"
    "Mango Pickle,Classic,5.50,MANGO-500,Spicy mango pickle,Pickles,500,g,4.50,3.00,6.00,USD\n"
    "Mango Pickle,Classic,5.50,MANGO-500,Duplicate mango pickle,Pickles,500,g,4.50,3.00,6.00,USD\n"
    "Bad Price,Classic,abc,,NaN price,Pickles,,,5.00,3.50,7.00,USD\n"
)


async def _upload(client, content: str):
    return await client.post(
        "/api/v1/products/import",
        files={"file": ("products.csv", content.encode("utf-8"), "text/csv")},
    )


@pytest.mark.asyncio
async def test_download_import_sample_csv(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await client.get("/api/v1/products/import/sample")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    body = r.text
    assert "name*,variant*,price*" in body
    assert "sku,description,category,size,size_type" in body
    assert "Mango Pickle,Classic,5.50" in body


@pytest.mark.asyncio
async def test_upload_csv_creates_products_with_variants_and_prices(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await _upload(client, VALID_CSV)
    assert r.status_code == 201, r.text
    result = r.json()
    assert result["created"] == 2
    assert result["failed"] == 0
    assert result["errors"] == []

    r = await client.get("/api/v1/products?limit=50&offset=0")
    assert r.status_code == 200
    names = {p["name"]: p for p in r.json()}
    assert "Mango Pickle" in names
    mango = names["Mango Pickle"]
    assert mango["variants"][0]["name"] == "Classic"
    assert mango["variants"][0]["sku"] == "MANGO-500"
    assert mango["variants"][0]["size"] == "500"
    assert mango["variants"][0]["prices"][0]["price"] == "5.50"
    assert mango["variants"][0]["prices"][0]["wholesale_price"] == "4.50"
    assert mango["variants"][0]["prices"][0]["cost_price"] == "3.00"
    assert mango["variants"][0]["prices"][0]["mrp_price"] == "6.00"
    assert mango["variants"][0]["prices"][0]["currency"] == "USD"


@pytest.mark.asyncio
async def test_upload_csv_reports_row_errors_and_still_imports_valid_rows(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await _upload(client, PARTIAL_CSV)
    assert r.status_code == 201, r.text
    result = r.json()
    assert result["created"] == 1
    assert result["failed"] == 2
    assert len(result["errors"]) == 2

    row_3 = next(e for e in result["errors"] if e["row"] == 3)
    assert "conflict" in row_3["message"].lower() or "exist" in row_3["message"].lower()
    row_4 = next(e for e in result["errors"] if e["row"] == 4)
    assert "price" in row_4["message"].lower()


@pytest.mark.asyncio
async def test_upload_csv_missing_required_column(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    csv_body = "name*,variant*\nSoup,Classic\n"
    r = await _upload(client, csv_body)
    assert r.status_code == 422
    assert "price*" in r.json()["detail"]


@pytest.mark.asyncio
async def test_import_write_forbidden_for_non_catalog_roles(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    user_id, _ = await _create_user(tenant_id, "accountant")
    client.cookies["access_token"] = create_access_token(user_id, tenant_id)

    r = await client.get("/api/v1/products/import/sample")
    assert r.status_code == 200, "sample download should be readable"

    r = await _upload(client, VALID_CSV)
    assert r.status_code == 403