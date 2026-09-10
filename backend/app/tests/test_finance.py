import uuid
from datetime import UTC, datetime

import pytest


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


def _tx(**overrides):
    base = {
        "type": "sale",
        "transaction_date": "2026-05-01T12:00:00Z",
        "amount": "150.00",
        "external_id": f"EXT-{uuid.uuid4().hex[:8]}",
        "currency": "USD",
        "description": "widget sale",
    }
    base.update(overrides)
    return base


async def _add_tx(client, **overrides):
    r = await client.post("/api/v1/transactions", json=_tx(**overrides))
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_summary_reflects_ledger(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    await _add_tx(client, type="sale", amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add_tx(client, type="purchase", amount="400.00", transaction_date="2026-05-15T12:00:00Z")
    await _add_tx(client, type="expense", amount="150.00", transaction_date="2026-05-20T12:00:00Z")

    r = await client.get("/api/v1/finance/summary?month=2026-05-01")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["month"] == "2026-05-01"
    assert body["currency"] == "USD"
    assert body["revenue"] == "1000.00"
    assert body["cogs"] == "400.00"
    assert body["operating_expense"] == "150.00"
    assert body["gross_profit"] == "600.00"
    assert body["net_profit"] == "450.00"
    assert body["gross_margin_percent"] == 60.0
    assert body["net_margin_percent"] == 45.0
    assert body["transaction_count"] == 3


@pytest.mark.asyncio
async def test_empty_month_returns_zeros(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await client.get("/api/v1/finance/summary?month=2026-03-01")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["revenue"] == "0.00"
    assert body["gross_profit"] == "0.00"
    assert body["net_profit"] == "0.00"
    assert body["gross_margin_percent"] is None
    assert body["transaction_count"] == 0


@pytest.mark.asyncio
async def test_reversal_cancels_revenue_in_reversal_month(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    sale = await _add_tx(
        client,
        type="sale",
        amount="500.00",
        transaction_date="2026-06-05T12:00:00Z",
    )

    june = await client.get("/api/v1/finance/summary?month=2026-06-01")
    assert june.json()["revenue"] == "500.00"

    r = await client.post(f"/api/v1/transactions/{sale['id']}/reverse")
    assert r.status_code == 200, r.text

    rev_month = datetime.now(UTC).date().replace(day=1).isoformat()
    reversal = await client.get(f"/api/v1/finance/summary?month={rev_month}")
    assert reversal.status_code == 200, reversal.text
    assert reversal.json()["revenue"] == "-500.00"
    # June is untouched by the reversal (it lands in the recorded month)
    june2 = await client.get("/api/v1/finance/summary?month=2026-06-01")
    assert june2.json()["revenue"] == "500.00"


@pytest.mark.asyncio
async def test_trends_returns_ordered_months(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    await _add_tx(client, type="sale", amount="100.00", transaction_date="2026-04-05T12:00:00Z")
    await _add_tx(client, type="sale", amount="200.00", transaction_date="2026-05-05T12:00:00Z")
    await _add_tx(client, type="sale", amount="300.00", transaction_date="2026-06-05T12:00:00Z")

    r = await client.get("/api/v1/finance/trends?months=3&end_month=2026-06-01")
    assert r.status_code == 200, r.text
    body = r.json()
    assert [m["month"] for m in body] == ["2026-04-01", "2026-05-01", "2026-06-01"]
    assert [m["revenue"] for m in body] == ["100.00", "200.00", "300.00"]


@pytest.mark.asyncio
async def test_profitability_has_twelve_ordered_rows(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    await _add_tx(client, type="sale", amount="10.00", transaction_date="2026-06-05T12:00:00Z")
    await _add_tx(client, type="expense", amount="2.00", transaction_date="2026-11-05T12:00:00Z")

    r = await client.get("/api/v1/finance/profitability?year=2026")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 12
    assert [m["month"] for m in body] == [
        f"2026-{m:02d}-01" for m in range(1, 13)
    ]
    by_month = {m["month"]: m for m in body}
    assert by_month["2026-06-01"]["revenue"] == "10.00"
    assert by_month["2026-11-01"]["operating_expense"] == "2.00"
    assert by_month["2026-01-01"]["revenue"] == "0.00"


@pytest.mark.asyncio
async def test_tenant_isolation_summaries_are_scoped(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    await _add_tx(client, type="sale", amount="9876.00", transaction_date="2026-05-10T12:00:00Z")

    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await client.get("/api/v1/finance/summary?month=2026-05-01")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["revenue"] == "0.00"
    assert body["transaction_count"] == 0


@pytest.mark.asyncio
async def test_upload_recalculates_summary(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    csv_bytes = (
        b"type,transaction_date,external_id,amount\n"
        b"sale,2026-05-01,UP-1,120.00\n"
        b"sale,2026-05-02,UP-2,80.00\n"
    )
    r = await client.post(
        "/api/v1/imports/upload",
        files={"file": ("may.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 201, r.text

    s = await client.get("/api/v1/finance/summary?month=2026-05-01")
    assert s.status_code == 200, s.text
    assert s.json()["revenue"] == "200.00"
    assert s.json()["transaction_count"] == 2