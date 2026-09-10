import io
import uuid

import pytest
from openpyxl import Workbook


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


def _make_xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "transactions"
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_csv_upload_creates_transactions(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    sku = f"SKU-{uuid.uuid4().hex[:6]}"
    r = await client.post(
        "/api/v1/products",
        json={
            "name": "Widget",
            "sku": sku,
            "variants": [
                {"name": "Default", "prices": [{"price": "10.00"}]}
            ],
        },
    )
    assert r.status_code == 201, r.text

    csv_bytes = (
        "type,transaction_date,external_id,amount,customer_email,product_sku,currency\n"
        f"sale,2026-06-01,UP-{uuid.uuid4().hex[:6]},120.00,bob@mail.com,,USD\n"
        f"purchase,2026-06-02,UP-{uuid.uuid4().hex[:6]},40.00,,{sku},EUR\n"
    ).encode()

    r = await client.post(
        "/api/v1/imports/upload",
        files={"file": ("june.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 201, r.text
    batch = r.json()
    assert batch["tenant_id"] == tenant_id
    assert batch["total_rows"] == 2
    assert batch["success_count"] == 2
    assert batch["error_count"] == 0
    assert batch["status"] == "completed"

    r = await client.get("/api/v1/transactions?limit=50&offset=0")
    assert r.status_code == 200
    assert len(r.json()) == 2


@pytest.mark.asyncio
async def test_xlsx_upload_creates_transactions(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    xlsx_bytes = _make_xlsx(
        [
            ["type", "transaction_date", "external_id", "amount"],
            ["sale", "2026-06-05", f"UX-{uuid.uuid4().hex[:6]}", "95.50"],
            ["expense", "2026-06-06", f"UX-{uuid.uuid4().hex[:6]}", "12.00"],
        ]
    )
    r = await client.post(
        "/api/v1/imports/upload",
        files={"file": ("june.xlsx", xlsx_bytes,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert r.status_code == 201, r.text
    batch = r.json()
    assert batch["total_rows"] == 2
    assert batch["success_count"] == 2
    assert batch["error_count"] == 0


@pytest.mark.asyncio
async def test_bad_row_is_recorded_as_error(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    csv_bytes = (
        "type,transaction_date,external_id,amount\n"
        f"sale,2026-06-01,UP-{uuid.uuid4().hex[:6]},100.00\n"
        f"sale,2026-06-02,UP-{uuid.uuid4().hex[:6]},BADAMOUNT\n"
    ).encode()
    r = await client.post(
        "/api/v1/imports/upload",
        files={"file": ("june.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 201, r.text
    batch = r.json()
    assert batch["total_rows"] == 2
    assert batch["success_count"] == 1
    assert batch["error_count"] >= 1
    assert batch["status"] in ("completed", "failed")


@pytest.mark.asyncio
async def test_unsupported_file_type_rejected(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await client.post(
        "/api/v1/imports/upload",
        files={"file": ("data.txt", b"hello world", "text/plain")},
    )
    assert r.status_code == 400
    assert "xlsx" in r.json()["detail"] or "csv" in r.json()["detail"]
