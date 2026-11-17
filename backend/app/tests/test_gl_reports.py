"""Tests for the double-entry GL reports (Stage 5)."""

import uuid

import pytest


async def _register(client, slug):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": slug,
            "email": f"{slug}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "GL Owner",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _tx(**overrides):
    base = {
        "type": "sale",
        "transaction_date": "2026-05-10T12:00:00Z",
        "amount": "1000.00",
        "external_id": f"GL-{uuid.uuid4().hex[:10]}",
        "currency": "NPR",
        "description": "gl report test",
    }
    base.update(overrides)
    return base


async def _add(client, **overrides):
    r = await client.post("/api/v1/transactions", json=_tx(**overrides))
    assert r.status_code == 201, r.text
    return r.json()


async def _customer(client, name="Acme Corp"):
    r = await client.post(
        "/api/v1/customers",
        json={"name": name, "email": f"{uuid.uuid4().hex[:8]}@acme.com"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _accounts(client):
    r = await client.get("/api/v1/accounting/accounts")
    assert r.status_code == 200, r.text
    return {account["code"]: account for account in r.json()}


async def _get(client, path):
    r = await client.get(path)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_gl_trial_balance_balances_and_matches_postings(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    await _add(client, type="sale", amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add(client, type="receipt", amount="300.00", transaction_date="2026-05-11T12:00:00Z")
    await _add(client, type="purchase", amount="200.00", transaction_date="2026-05-12T12:00:00Z")
    await _add(client, type="expense", amount="100.00", transaction_date="2026-05-13T12:00:00Z")

    body = await _get(
        client,
        "/api/v1/accounting/gl/trial-balance"
        "?date_from=2026-05-01&date_to=2026-05-31",
    )
    assert body["balanced"] is True
    assert body["total_period_debit"] == body["total_period_credit"]
    assert body["total_closing_debit"] == body["total_closing_credit"]

    rows = {row["code"]: row for row in body["rows"]}
    assert rows["1030"]["closing_debit"] == "700.00"
    assert rows["1050"]["closing_debit"] == "200.00"
    assert rows["1010"]["closing_debit"] == "0.00"
    assert rows["4000"]["closing_credit"] == "1000.00"
    assert rows["6190"]["closing_debit"] == "100.00"


@pytest.mark.asyncio
async def test_gl_profit_loss_uses_journal_net_of_vat(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    await _add(
        client,
        type="sale",
        amount="1000.00",
        tax_amount="100.00",
        transaction_date="2026-05-10T12:00:00Z",
    )
    await _add(
        client,
        type="purchase",
        amount="500.00",
        tax_amount="50.00",
        transaction_date="2026-05-12T12:00:00Z",
    )
    await _add(client, type="expense", amount="200.00", transaction_date="2026-05-13T12:00:00Z")

    body = await _get(
        client,
        "/api/v1/accounting/gl/profit-loss"
        "?date_from=2026-05-01&date_to=2026-05-31",
    )
    assert body["total_income"] == "900.00"
    assert body["total_expenses"] == "200.00"
    assert body["cogs"] == "0.00"
    assert body["gross_profit"] == "900.00"
    assert body["operating_expenses"] == "200.00"
    assert body["net_profit"] == "700.00"


@pytest.mark.asyncio
async def test_gl_profit_loss_posts_cogs_when_cost_is_known(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    await _add(
        client,
        amount="1000.00",
        metadata={"cost_amount": "400.00"},
        transaction_date="2026-05-10T12:00:00Z",
    )

    body = await _get(
        client,
        "/api/v1/accounting/gl/profit-loss"
        "?date_from=2026-05-01&date_to=2026-05-31",
    )
    assert body["cogs"] == "400.00"
    assert body["gross_profit"] == "600.00"
    assert body["net_profit"] == "600.00"


@pytest.mark.asyncio
async def test_gl_balance_sheet_includes_opening_and_balances(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    r = await client.put(
        "/api/v1/accounting/settings",
        json={
            "book_start_date": "2026-05-01",
            "opening_cash": "5000.00",
            "opening_capital": "5000.00",
        },
    )
    assert r.status_code == 200, r.text

    await _add(client, amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add(client, type="receipt", amount="400.00", transaction_date="2026-05-11T12:00:00Z")
    await _add(client, type="expense", amount="100.00", transaction_date="2026-05-12T12:00:00Z")

    body = await _get(
        client, "/api/v1/accounting/gl/balance-sheet?as_of=2026-05-31"
    )
    assert body["balanced"] is True, body
    assert body["difference"] == "0.00"
    assert body["current_earnings"] == "900.00"
    assert body["total_assets"] == "5900.00"
    assert body["total_equity"] == "5900.00"
    cash = next(line for line in body["assets"] if line["code"] == "1010")
    assert cash["amount"] == "5300.00"
    receivable = next(line for line in body["assets"] if line["code"] == "1030")
    assert receivable["amount"] == "600.00"


@pytest.mark.asyncio
async def test_gl_cash_flow_reconciles_to_gl_cash(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    r = await client.put(
        "/api/v1/accounting/settings",
        json={
            "book_start_date": "2026-05-01",
            "opening_cash": "1000.00",
            "opening_capital": "1000.00",
        },
    )
    assert r.status_code == 200, r.text

    await _add(client, type="receipt", amount="700.00", transaction_date="2026-05-10T12:00:00Z")
    await _add(client, type="expense", amount="200.00", transaction_date="2026-05-12T12:00:00Z")
    await _add(client, type="purchase", amount="100.00", transaction_date="2026-05-13T12:00:00Z")

    body = await _get(
        client,
        "/api/v1/accounting/gl/cash-flow"
        "?date_from=2026-05-01&date_to=2026-05-31",
    )
    assert body["opening_cash"] == "1000.00"
    assert body["net_operating"] == "400.00"
    assert body["net_change"] == "400.00"
    assert body["closing_cash"] == "1400.00"
    assert body["balanced"] is True


@pytest.mark.asyncio
async def test_gl_day_book_lists_entries_and_lines(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    await _add(client, amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add(client, type="receipt", amount="300.00", transaction_date="2026-05-11T12:00:00Z")

    body = await _get(
        client,
        "/api/v1/accounting/gl/day-book?date_from=2026-05-01&date_to=2026-05-31",
    )
    assert body["count"] == 2
    sale = next(entry for entry in body["entries"] if entry["voucher_type"] == "sales")
    codes = {line["account_code"]: line for line in sale["lines"]}
    assert codes["1030"]["debit"] == "1000.00"
    assert codes["4000"]["credit"] == "1000.00"


@pytest.mark.asyncio
async def test_gl_ledger_running_balance(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    accounts = await _accounts(client)
    await _add(client, amount="1000.00", transaction_date="2026-05-10T12:00:00Z")
    await _add(client, type="receipt", amount="300.00", transaction_date="2026-05-11T12:00:00Z")

    body = await _get(
        client,
        f"/api/v1/accounting/gl/ledger/{accounts['1030']['id']}"
        "?date_from=2026-05-01&date_to=2026-05-31",
    )
    assert body["opening_balance"] == "0.00"
    assert body["total_debit"] == "1000.00"
    assert body["total_credit"] == "300.00"
    assert body["closing_balance"] == "700.00"
    assert [line["balance"] for line in body["lines"]] == ["1000.00", "700.00"]


@pytest.mark.asyncio
async def test_gl_party_statement_and_fifo_aging(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    customer = await _customer(client)
    await _add(
        client,
        amount="1000.00",
        customer_id=customer["id"],
        transaction_date="2026-05-01T12:00:00Z",
    )
    await _add(
        client,
        type="receipt",
        amount="400.00",
        customer_id=customer["id"],
        transaction_date="2026-05-11T12:00:00Z",
    )

    statement = await _get(
        client,
        f"/api/v1/accounting/gl/party-statement?party_id={customer['id']}",
    )
    assert statement["party_name"] == "Acme Corp"
    assert statement["opening_balance"] == "0.00"
    assert statement["total_debit"] == "1000.00"
    assert statement["total_credit"] == "400.00"
    assert statement["closing_balance"] == "600.00"

    aging = await _get(
        client, "/api/v1/accounting/gl/aging?as_of=2026-06-15"
    )
    assert aging["totals"]["total"] == "600.00"
    row = aging["rows"][0]
    assert row["party_id"] == customer["id"]
    assert row["days_31_60"] == "600.00"
    assert row["credit_balance"] == "0.00"


@pytest.mark.asyncio
async def test_gl_tax_summary_groups_output_and_input_vat(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    await _add(
        client,
        amount="1000.00",
        tax_amount="100.00",
        transaction_date="2026-05-10T12:00:00Z",
    )
    await _add(
        client,
        type="purchase",
        amount="500.00",
        tax_amount="50.00",
        transaction_date="2026-05-12T12:00:00Z",
    )

    body = await _get(
        client,
        "/api/v1/accounting/gl/tax-summary"
        "?date_from=2026-05-01&date_to=2026-05-31",
    )
    assert body["output_vat"] == "100.00"
    assert body["input_vat"] == "50.00"
    assert body["net_payable"] == "50.00"
    assert body["lines"][0]["period"] == "2026-05"


@pytest.mark.asyncio
async def test_gl_reports_are_tenant_isolated(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    await _add(client, amount="1000.00", transaction_date="2026-05-10T12:00:00Z")

    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    await _add(client, amount="500.00", transaction_date="2026-05-10T12:00:00Z")

    body = await _get(
        client,
        "/api/v1/accounting/gl/profit-loss"
        "?date_from=2026-05-01&date_to=2026-05-31",
    )
    assert body["total_income"] == "500.00"


@pytest.mark.asyncio
async def test_report_engine_setting_controls_cutover_flag(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")

    settings = await _get(client, "/api/v1/accounting/settings")
    assert settings["report_engine"] == "legacy"

    r = await client.put(
        "/api/v1/accounting/settings", json={"report_engine": "gl"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["report_engine"] == "gl"

    r = await client.put(
        "/api/v1/accounting/settings", json={"report_engine": "spreadsheet"}
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_gl_exports_xlsx_and_pdf(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    await _add(client, amount="1000.00", transaction_date="2026-05-10T12:00:00Z")

    r = await client.get(
        "/api/v1/accounting/gl/export"
        "?report=trial-balance&format=xlsx&date_from=2026-05-01&date_to=2026-05-31"
    )
    assert r.status_code == 200, r.text
    assert r.content[:2] == b"PK"
    assert "spreadsheetml" in r.headers["content-type"]

    r = await client.get(
        "/api/v1/accounting/gl/export"
        "?report=profit-loss&format=pdf&date_from=2026-05-01&date_to=2026-05-31"
    )
    assert r.status_code == 200, r.text
    assert r.content[:4] == b"%PDF"
    assert r.headers["content-type"] == "application/pdf"


@pytest.mark.asyncio
async def test_gl_ledger_export_requires_account_id(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    r = await client.get(
        "/api/v1/accounting/gl/export?report=ledger&format=xlsx"
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_opening_voucher_dates_to_earliest_transaction(client):
    await _register(client, f"g{uuid.uuid4().hex[:6]}")
    await _add(client, amount="1000.00", transaction_date="2026-05-10T12:00:00Z")

    r = await client.put(
        "/api/v1/accounting/settings",
        json={"opening_cash": "5000.00", "opening_capital": "5000.00"},
    )
    assert r.status_code == 200, r.text

    body = await _get(
        client, "/api/v1/accounting/gl/balance-sheet?as_of=2026-05-31"
    )
    assert body["balanced"] is True, body
    assert body["total_assets"] == "6000.00"
    assert body["total_equity"] == "6000.00"
