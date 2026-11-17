"""Stage 7: inventory valuation, TDS and bank reconciliation."""

import uuid
from decimal import Decimal

import pytest


async def _register(client, slug):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": f"{slug}{uuid.uuid4().hex[:6]}",
            "email": f"{slug}{uuid.uuid4().hex[:6]}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Stage Seven",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _accounts(client):
    r = await client.get("/api/v1/accounting/accounts")
    assert r.status_code == 200, r.text
    return {a["code"]: a for a in r.json()}


def _tx(**overrides):
    base = {
        "type": "sale",
        "transaction_date": "2026-06-01T12:00:00Z",
        "amount": "100.00",
        "external_id": f"S7-{uuid.uuid4().hex[:10]}",
        "currency": "NPR",
        "description": "stage 7 test",
    }
    base.update(overrides)
    return base


async def _product(client, *, stock=0, cost="10.00"):
    r = await client.post(
        "/api/v1/products",
        json={
            "name": f"Item {uuid.uuid4().hex[:6]}",
            "variants": [
                {
                    "name": "Default",
                    "sku": f"SKU-{uuid.uuid4().hex[:8]}",
                    "stock_quantity": stock,
                    "prices": [{"price": "20.00", "cost_price": cost}],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _variant(client, product):
    r = await client.get(f"/api/v1/products/{product['id']}")
    assert r.status_code == 200, r.text
    return r.json()["variants"][0]


async def _entry_for(client, tx_id):
    r = await client.get("/api/v1/accounting/journal-entries?limit=500")
    assert r.status_code == 200, r.text
    matches = [
        entry
        for entry in r.json()
        if entry["source_id"] == str(tx_id) and entry["status"] == "posted"
    ]
    assert len(matches) == 1, matches
    return matches[0]


def _by_code(entry, accounts):
    code_by_id = {a["id"]: code for code, a in accounts.items()}
    result = {}
    for line in entry["lines"]:
        code = code_by_id[line["account_id"]]
        debit, credit = result.get(code, (Decimal("0"), Decimal("0")))
        result[code] = (
            debit + Decimal(line["debit"]),
            credit + Decimal(line["credit"]),
        )
    return result


@pytest.mark.asyncio
async def test_purchase_updates_weighted_average_and_posts_inventory(client):
    await _register(client, "avg")
    accounts = await _accounts(client)
    product = await _product(client, stock=10, cost="5.00")
    variant = await _variant(client, product)
    assert Decimal(variant["average_cost"]) == Decimal("5.0000")

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(
            type="purchase",
            amount="120.00",
            tax_amount="20.00",
            product_id=product["id"],
            quantity="10",
        ),
    )
    assert r.status_code == 201, r.text
    entry = await _entry_for(client, r.json()["id"])
    lines = _by_code(entry, accounts)
    assert lines["1050"] == (Decimal("100.00"), Decimal("0"))
    assert lines["1070"] == (Decimal("20.00"), Decimal("0"))
    assert lines["1010"] == (Decimal("0"), Decimal("120.00"))

    variant = await _variant(client, product)
    assert variant["stock_quantity"] == 20
    assert Decimal(variant["average_cost"]) == Decimal("7.5000")

    r = await client.get(
        f"/api/v1/products/inventory/movements?reason=purchase&product_id={product['id']}"
    )
    assert r.status_code == 200, r.text
    movement = r.json()[0]
    assert movement["quantity"] == 10
    assert Decimal(movement["unit_cost"]) == Decimal("10.0000")
    assert Decimal(movement["total_cost"]) == Decimal("100.00")
    assert movement["transaction_id"] == entry["source_id"]


@pytest.mark.asyncio
async def test_direct_sale_issues_stock_and_posts_cogs_at_average_cost(client):
    await _register(client, "saleavg")
    accounts = await _accounts(client)
    product = await _product(client, stock=20, cost="7.50")

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(
            type="sale",
            amount="80.00",
            product_id=product["id"],
            quantity="4",
        ),
    )
    assert r.status_code == 201, r.text
    entry = await _entry_for(client, r.json()["id"])
    lines = _by_code(entry, accounts)
    assert lines["1030"] == (Decimal("80.00"), Decimal("0"))
    assert lines["4000"] == (Decimal("0"), Decimal("80.00"))
    assert lines["5000"] == (Decimal("30.00"), Decimal("0"))
    assert lines["1050"] == (Decimal("0"), Decimal("30.00"))

    variant = await _variant(client, product)
    assert variant["stock_quantity"] == 16
    assert Decimal(variant["average_cost"]) == Decimal("7.5000")


@pytest.mark.asyncio
async def test_sale_tds_posts_tds_receivable(client):
    await _register(client, "saletds")
    accounts = await _accounts(client)

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(amount="1000.00", tax_amount="130.00", tds_amount="50.00"),
    )
    assert r.status_code == 201, r.text
    entry = await _entry_for(client, r.json()["id"])
    lines = _by_code(entry, accounts)
    assert lines["1030"] == (Decimal("950.00"), Decimal("0"))
    assert lines["1085"] == (Decimal("50.00"), Decimal("0"))
    assert lines["4000"] == (Decimal("0"), Decimal("870.00"))
    assert lines["2030"] == (Decimal("0"), Decimal("130.00"))


@pytest.mark.asyncio
async def test_purchase_tds_and_vat_posts_payable(client):
    await _register(client, "purtds")
    accounts = await _accounts(client)

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(
            type="purchase",
            amount="1000.00",
            tax_amount="130.00",
            tds_amount="50.00",
        ),
    )
    assert r.status_code == 201, r.text
    entry = await _entry_for(client, r.json()["id"])
    lines = _by_code(entry, accounts)
    assert lines["1050"] == (Decimal("870.00"), Decimal("0"))
    assert lines["1070"] == (Decimal("130.00"), Decimal("0"))
    assert lines["2040"] == (Decimal("0"), Decimal("50.00"))
    assert lines["1010"] == (Decimal("0"), Decimal("950.00"))


@pytest.mark.asyncio
async def test_receipt_uses_bank_account_when_method_is_bank(client):
    await _register(client, "bankmethod")
    accounts = await _accounts(client)

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(
            type="receipt",
            amount="500.00",
            metadata={"method": "bank_transfer"},
        ),
    )
    assert r.status_code == 201, r.text
    entry = await _entry_for(client, r.json()["id"])
    lines = _by_code(entry, accounts)
    assert lines["1020"] == (Decimal("500.00"), Decimal("0"))
    assert lines["1030"] == (Decimal("0"), Decimal("500.00"))


@pytest.mark.asyncio
async def test_bank_statement_auto_match_and_reconciliation(client):
    await _register(client, "bankrec")
    accounts = await _accounts(client)

    r = await client.post(
        "/api/v1/accounting/bank-accounts",
        json={
            "name": "Nabil Current",
            "bank_name": "Nabil Bank",
            "account_number": "001234",
            "gl_account_id": accounts["1020"]["id"],
        },
    )
    assert r.status_code == 201, r.text
    account_id = r.json()["id"]
    assert r.json()["gl_account_code"] == "1020"

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(
            type="receipt",
            amount="500.00",
            transaction_date="2026-06-10T12:00:00Z",
            metadata={"method": "bank_transfer"},
        ),
    )
    assert r.status_code == 201, r.text

    r = await client.post(
        f"/api/v1/accounting/bank-accounts/{account_id}/statement-lines",
        json={
            "lines": [
                {
                    "statement_date": "2026-06-10",
                    "description": "Customer deposit",
                    "reference": "TXN-1",
                    "amount": "500.00",
                }
            ]
        },
    )
    assert r.status_code == 201, r.text
    line_id = r.json()[0]["id"]

    r = await client.post(
        f"/api/v1/accounting/bank-accounts/{account_id}/auto-match",
        json={"date_window_days": 3},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["matched"] == 1
    assert body["unmatched"] == 0

    r = await client.get(
        f"/api/v1/accounting/bank-accounts/{account_id}/reconciliation"
    )
    assert r.status_code == 200, r.text
    recon = r.json()
    assert Decimal(recon["statement_balance"]) == Decimal("500.00")
    assert Decimal(recon["book_balance"]) == Decimal("500.00")
    assert Decimal(recon["difference"]) == Decimal("0.00")
    assert recon["balanced"] is True

    r = await client.post(
        f"/api/v1/accounting/bank-statement-lines/{line_id}/unmatch"
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "unmatched"


@pytest.mark.asyncio
async def test_inventory_reconciliation_matches_gl(client):
    await _register(client, "invrec")
    product = await _product(client, stock=0, cost="10.00")

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(
            type="purchase",
            amount="100.00",
            product_id=product["id"],
            quantity="10",
        ),
    )
    assert r.status_code == 201, r.text

    r = await client.get("/api/v1/accounting/inventory/reconciliation")
    assert r.status_code == 200, r.text
    body = r.json()
    assert Decimal(body["gl_inventory"]) == Decimal("100.00")
    assert Decimal(body["stock_value"]) == Decimal("100.00")
    assert Decimal(body["difference"]) == Decimal("0.00")
    assert body["balanced"] is True
    assert len(body["rows"]) == 1
    assert body["rows"][0]["quantity"] == 10


@pytest.mark.asyncio
async def test_void_purchase_reverses_stock(client):
    await _register(client, "voidpur")
    product = await _product(client, stock=0, cost="10.00")

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(
            type="purchase",
            amount="50.00",
            product_id=product["id"],
            quantity="5",
        ),
    )
    assert r.status_code == 201, r.text
    tx_id = r.json()["id"]
    assert (await _variant(client, product))["stock_quantity"] == 5

    r = await client.delete(f"/api/v1/transactions/{tx_id}")
    assert r.status_code == 204, r.text
    assert (await _variant(client, product))["stock_quantity"] == 0

    r = await client.get(
        f"/api/v1/products/inventory/movements?reason=transaction_void&product_id={product['id']}"
    )
    assert r.status_code == 200, r.text
    movement = r.json()[0]
    assert movement["quantity"] == -5
    assert Decimal(movement["unit_cost"]) == Decimal("10.0000")


@pytest.mark.asyncio
async def test_bank_accounts_are_tenant_scoped(client):
    await _register(client, "banktenant1")
    accounts = await _accounts(client)
    r = await client.post(
        "/api/v1/accounting/bank-accounts",
        json={
            "name": "Shared Name",
            "gl_account_id": accounts["1020"]["id"],
        },
    )
    assert r.status_code == 201, r.text
    account_id = r.json()["id"]

    r = await client.post(
        f"/api/v1/accounting/bank-accounts/{account_id}/statement-lines",
        json={
            "lines": [
                {
                    "statement_date": "2026-06-10",
                    "amount": "25.00",
                }
            ]
        },
    )
    assert r.status_code == 201, r.text
    line_id = r.json()[0]["id"]

    await _register(client, "banktenant2")
    r = await client.get("/api/v1/accounting/bank-accounts")
    assert r.status_code == 200, r.text
    assert r.json() == []

    r = await client.post(
        f"/api/v1/accounting/bank-statement-lines/{line_id}/unmatch"
    )
    assert r.status_code == 404, r.text
