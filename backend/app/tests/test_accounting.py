import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


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
        "currency": "NPR",
        "description": "widget sale",
    }
    base.update(overrides)
    return base


async def _add_tx(client, **overrides):
    r = await client.post("/api/v1/transactions", json=_tx(**overrides))
    assert r.status_code == 201, r.text
    return r.json()


async def _fresh_tenant(client):
    return await _register(client, f"t{uuid.uuid4().hex[:6]}")


# ---- profit & loss --------------------------------------------------------------


@pytest.mark.asyncio
async def test_pl_from_ledger(client):
    await _fresh_tenant(client)
    await _add_tx(client, type="sale", amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add_tx(client, type="expense", amount="150.00", transaction_date="2026-05-20T12:00:00Z")

    r = await client.get(
        "/api/v1/accounting/profit-loss?date_from=2026-05-01&date_to=2026-05-31"
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["revenue"] == "1000.00"
    assert body["operating_expenses"] == "150.00"
    # No order items -> cogs falls back to purchases (zero here).
    assert body["cogs"] == "0.00"
    assert body["gross_profit"] == "1000.00"
    assert body["net_profit"] == "850.00"
    assert body["net_margin_pct"] == "85.00"
    assert body["cogs_basis"] == "purchases"


@pytest.mark.asyncio
async def test_pl_receipt_is_not_revenue(client):
    await _fresh_tenant(client)
    await _add_tx(client, type="receipt", amount="500.00", transaction_date="2026-05-10T12:00:00Z")

    r = await client.get(
        "/api/v1/accounting/profit-loss?date_from=2026-05-01&date_to=2026-05-31"
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["revenue"] == "0.00"
    assert body["net_profit"] == "0.00"


@pytest.mark.asyncio
async def test_pl_purchase_used_as_cogs_fallback(client):
    await _fresh_tenant(client)
    await _add_tx(client, type="sale", amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add_tx(client, type="purchase", amount="400.00", transaction_date="2026-05-12T12:00:00Z")

    r = await client.get(
        "/api/v1/accounting/profit-loss?date_from=2026-05-01&date_to=2026-05-31"
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cogs"] == "400.00"
    assert body["gross_profit"] == "600.00"
    assert body["cogs_basis"] == "purchases"


# ---- trial balance --------------------------------------------------------------


@pytest.mark.asyncio
async def test_trial_balance_balances(client):
    await _fresh_tenant(client)
    await _add_tx(client, type="sale", amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add_tx(client, type="receipt", amount="300.00", transaction_date="2026-05-11T12:00:00Z")
    await _add_tx(client, type="purchase", amount="400.00", transaction_date="2026-05-12T12:00:00Z")
    await _add_tx(client, type="expense", amount="150.00", transaction_date="2026-05-13T12:00:00Z")

    r = await client.get("/api/v1/accounting/trial-balance?date_to=2026-05-31")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_debit"] == body["total_credit"]
    assert body["balanced"] is True
    accounts = {row["account"]: row for row in body["rows"]}
    assert accounts["Sales Revenue"]["credit"] == "1000.00"
    assert accounts["Operating Expenses"]["debit"] == "150.00"


@pytest.mark.asyncio
async def test_trial_balance_respects_amount_filter(client):
    await _fresh_tenant(client)
    await _add_tx(client, type="sale", amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add_tx(client, type="sale", amount="50.00", transaction_date="2026-05-11T12:00:00Z")

    r = await client.get(
        "/api/v1/accounting/trial-balance?date_to=2026-05-31&min_amount=100"
    )
    assert r.status_code == 200, r.text
    accounts = {row["account"]: row for row in r.json()["rows"]}
    assert accounts["Sales Revenue"]["credit"] == "1000.00"


# ---- balance sheet --------------------------------------------------------------


@pytest.mark.asyncio
async def test_balance_sheet_uses_opening_balances_and_balances(client):
    await _fresh_tenant(client)
    # Seed opening capital so the sheet opens balanced.
    r = await client.put(
        "/api/v1/accounting/settings",
        json={"opening_cash": "5000.00", "opening_capital": "5000.00"},
    )
    assert r.status_code == 200, r.text

    await _add_tx(client, type="sale", amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add_tx(client, type="receipt", amount="400.00", transaction_date="2026-05-11T12:00:00Z")
    await _add_tx(client, type="expense", amount="100.00", transaction_date="2026-05-12T12:00:00Z")

    r = await client.get("/api/v1/accounting/balance-sheet?as_of=2026-05-31")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["balanced"] is True, body
    assert body["difference"] == "0.00"
    # Cash = 5000 opening + 400 receipt - 100 expense.
    cash = next(line["amount"] for line in body["assets"] if line["label"] == "Cash & Bank")
    assert cash == "5300.00"
    # Retained earnings carry the net profit (1000 - 100).
    assert body["retained_earnings"] == "900.00"


@pytest.mark.asyncio
async def test_balance_sheet_without_openings_still_balances(client):
    await _fresh_tenant(client)
    await _add_tx(client, type="sale", amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add_tx(client, type="receipt", amount="1000.00", transaction_date="2026-05-11T12:00:00Z")

    r = await client.get("/api/v1/accounting/balance-sheet?as_of=2026-05-31")
    assert r.status_code == 200, r.text
    body = r.json()
    # Ledger-derived: cash 1000 = retained earnings 1000, so it ties out even
    # with no stated opening balances.
    assert body["balanced"] is True, body
    assert body["difference"] == "0.00"
    cash = next(line["amount"] for line in body["assets"] if line["label"] == "Cash & Bank")
    assert cash == "1000.00"


# ---- cash flow ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cash_flow_operating_section(client):
    await _fresh_tenant(client)
    await _add_tx(client, type="receipt", amount="700.00", transaction_date="2026-05-10T12:00:00Z")
    await _add_tx(client, type="expense", amount="200.00", transaction_date="2026-05-12T12:00:00Z")
    await _add_tx(client, type="purchase", amount="100.00", transaction_date="2026-05-13T12:00:00Z")

    r = await client.get(
        "/api/v1/accounting/cash-flow?date_from=2026-05-01&date_to=2026-05-31"
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["net_operating"] == "400.00"
    assert body["net_change"] == "400.00"
    assert body["closing_cash"] == "400.00"


@pytest.mark.asyncio
async def test_cash_flow_reversal_cancels_receipt(client):
    await _fresh_tenant(client)
    receipt = await _add_tx(
        client, type="receipt", amount="700.00", transaction_date="2026-05-10T12:00:00Z"
    )
    r = await client.post(f"/api/v1/transactions/{receipt['id']}/reverse")
    assert r.status_code == 200, r.text

    r = await client.get(
        "/api/v1/accounting/cash-flow?date_from=2026-05-01&date_to=2099-12-31"
    )
    assert r.status_code == 200, r.text
    assert r.json()["net_operating"] == "0.00"


# ---- tenant isolation -----------------------------------------------------------


@pytest.mark.asyncio
async def test_statements_are_tenant_scoped(client):
    await _fresh_tenant(client)
    await _add_tx(client, type="sale", amount="9876.00", transaction_date="2026-05-10T12:00:00Z")

    await _fresh_tenant(client)
    r = await client.get(
        "/api/v1/accounting/profit-loss?date_from=2026-05-01&date_to=2026-05-31"
    )
    assert r.status_code == 200, r.text
    assert r.json()["revenue"] == "0.00"


# ---- khata payments post into the ledger ----------------------------------------


async def _create_product(client, name):
    r = await client.post(
        "/api/v1/products",
        json={
            "name": name,
            "variants": [
                {
                    "name": "Default",
                    "sku": f"VAR-{name}-{uuid.uuid4().hex[:4]}",
                    "stock_quantity": 100,
                    "prices": [{"price": "10.00"}],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_customer(client, name="Acme"):
    r = await client.post(
        "/api/v1/customers",
        json={"name": name, "email": f"{name.lower()}{uuid.uuid4().hex[:6]}@acme.com"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_delivered_order(client, product, customer):
    r = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["id"],
            "delivery_address": "123 Main St",
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "2.00",
                    "unit_price": "10.00",
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    order = r.json()
    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "confirmed"})
    assert r.status_code == 200, r.text

    from app.core.database import get_session
    from app.modules.orders.models import Order

    async with get_session() as session:
        row = (
            await session.execute(select(Order).where(Order.id == order["id"]))
        ).scalar_one()
        row.status = "delivered"
        await session.commit()
    return order


@pytest.mark.asyncio
async def test_khata_payment_posts_receipt_to_ledger(client):
    await _fresh_tenant(client)
    product = await _create_product(client, "Widget")
    customer = await _create_customer(client)
    await _create_delivered_order(client, product, customer)

    r = await client.post(
        "/api/v1/khata/payments",
        json={
            "customer_id": customer["id"],
            "amount": "15.00",
            "method": "cash",
            "generate_receipt": False,
        },
    )
    assert r.status_code == 201, r.text

    # The receipt shows up in the ledger and in cash flow.
    r = await client.get(
        "/api/v1/accounting/cash-flow?date_from=2000-01-01&date_to=2099-12-31"
    )
    assert r.status_code == 200, r.text
    assert r.json()["net_operating"] == "15.00"

    # And it is a cash movement only — never revenue.
    r = await client.get(
        "/api/v1/accounting/profit-loss?date_from=2000-01-01&date_to=2099-12-31"
    )
    assert r.status_code == 200, r.text
    assert r.json()["revenue"] == "0.00"


@pytest.mark.asyncio
async def test_voided_khata_payment_reverses_ledger_receipt(client):
    await _fresh_tenant(client)
    product = await _create_product(client, "Widget")
    customer = await _create_customer(client)
    await _create_delivered_order(client, product, customer)

    r = await client.post(
        "/api/v1/khata/payments",
        json={
            "customer_id": customer["id"],
            "amount": "15.00",
            "method": "cash",
            "generate_receipt": False,
        },
    )
    assert r.status_code == 201, r.text
    payment_id = r.json()["id"]

    r = await client.post(
        f"/api/v1/khata/payments/{payment_id}/void",
        json={"reason": "entered by mistake"},
    )
    assert r.status_code == 200, r.text

    r = await client.get(
        "/api/v1/accounting/cash-flow?date_from=2000-01-01&date_to=2099-12-31"
    )
    assert r.status_code == 200, r.text
    assert r.json()["net_operating"] == "0.00"
