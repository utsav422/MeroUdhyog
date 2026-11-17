"""Tests for fiscal years, period close/reopen and the audit trail (Stage 6)."""

import uuid
from decimal import Decimal

import pytest


async def _register(client, slug):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": slug,
            "email": f"{slug}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Period Owner",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _tx(**overrides):
    base = {
        "type": "sale",
        "transaction_date": "2026-05-10T12:00:00Z",
        "amount": "1000.00",
        "external_id": f"PER-{uuid.uuid4().hex[:10]}",
        "currency": "NPR",
        "description": "period test",
    }
    base.update(overrides)
    return base


async def _add(client, **overrides):
    r = await client.post("/api/v1/transactions", json=_tx(**overrides))
    assert r.status_code == 201, r.text
    return r.json()


async def _create_fy(client, start="2026-05-01", end="2026-05-31", name="FY 2026-05"):
    r = await client.post(
        "/api/v1/accounting/fiscal-years",
        json={"name": name, "start_date": start, "end_date": end},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _periods(client, fiscal_year_id=None):
    path = "/api/v1/accounting/periods"
    if fiscal_year_id:
        path += f"?fiscal_year_id={fiscal_year_id}"
    r = await client.get(path)
    assert r.status_code == 200, r.text
    return r.json()


async def _entries(client):
    r = await client.get("/api/v1/accounting/journal-entries?limit=500")
    assert r.status_code == 200, r.text
    return r.json()


async def _accounts(client):
    r = await client.get("/api/v1/accounting/accounts")
    assert r.status_code == 200, r.text
    return {a["code"]: a for a in r.json()}


async def _audit(client, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    r = await client.get(f"/api/v1/accounting/audit-log?{query}")
    assert r.status_code == 200, r.text
    return r.json()


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


async def _create_role_user(tenant_id, role, email):
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
        )
        session.add(user)
        await session.flush()
        user_id = user.id
    return user_id


@pytest.mark.asyncio
async def test_fiscal_year_generates_monthly_periods(client):
    slug = f"p{uuid.uuid4().hex[:6]}"
    await _register(client, slug)

    fiscal_year = await _create_fy(client, start="2026-01-01", end="2026-03-31", name="FY 2026 Q1")
    assert fiscal_year["is_closed"] is False
    assert fiscal_year["closed_at"] is None

    periods = await _periods(client, fiscal_year["id"])
    assert [p["name"] for p in periods] == ["2026-01", "2026-02", "2026-03"]
    assert periods[0]["start_date"] == "2026-01-01"
    assert periods[0]["end_date"] == "2026-01-31"
    assert periods[-1]["end_date"] == "2026-03-31"
    assert all(p["is_closed"] is False for p in periods)

    r = await client.post(
        "/api/v1/accounting/fiscal-years",
        json={
            "name": "Overlap",
            "start_date": "2026-03-01",
            "end_date": "2026-04-30",
        },
    )
    assert r.status_code == 422, r.text

    r = await client.post(
        "/api/v1/accounting/fiscal-years",
        json={
            "name": "Backwards",
            "start_date": "2026-05-01",
            "end_date": "2026-04-30",
        },
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_close_period_posts_closing_entry_and_blocks_posting(client):
    slug = f"p{uuid.uuid4().hex[:6]}"
    await _register(client, slug)
    sale = await _add(client, type="sale", amount="1000.00")
    await _add(
        client,
        type="expense",
        amount="200.00",
        transaction_date="2026-05-20T12:00:00Z",
    )
    fiscal_year = await _create_fy(client)
    period = (await _periods(client, fiscal_year["id"]))[0]
    accounts = await _accounts(client)

    r = await client.post(
        f"/api/v1/accounting/periods/{period['id']}/close",
        json={"reason": "May books final"},
    )
    assert r.status_code == 200, r.text
    closed = r.json()
    assert closed["is_closed"] is True
    assert closed["closed_by"] is not None

    entries = await _entries(client)
    closing = [
        entry
        for entry in entries
        if entry["source_type"] == "period_close" and entry["status"] == "posted"
    ]
    assert len(closing) == 1, closing
    closing_entry = closing[0]
    assert closing_entry["voucher_type"] == "closing"
    assert closing_entry["entry_date"] == "2026-05-31"
    lines = _by_code(closing_entry, accounts)
    assert lines["4000"] == (Decimal("1000.00"), Decimal("0.00"))
    assert lines["6190"] == (Decimal("0.00"), Decimal("200.00"))
    assert lines["3030"] == (Decimal("0.00"), Decimal("800.00"))

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(transaction_date="2026-05-15T12:00:00Z"),
    )
    assert r.status_code == 422, r.text
    assert "closed" in r.json()["detail"].lower()

    r = await client.delete(f"/api/v1/transactions/{sale['id']}")
    assert r.status_code == 422, r.text
    assert "closed" in r.json()["detail"].lower()

    pnl = await client.get(
        "/api/v1/accounting/gl/profit-loss" "?date_from=2026-05-01&date_to=2026-05-31"
    )
    assert pnl.status_code == 200, pnl.text
    assert pnl.json()["total_income"] == "1000.00"
    assert pnl.json()["total_expenses"] == "200.00"
    assert pnl.json()["net_profit"] == "800.00"

    balance_sheet = await client.get("/api/v1/accounting/gl/balance-sheet?as_of=2026-05-31")
    assert balance_sheet.status_code == 200, balance_sheet.text
    body = balance_sheet.json()
    assert body["current_earnings"] == "0.00"
    assert body["balanced"] is True
    retained = [line for line in body["equity"] if line["code"] == "3030"]
    assert retained and retained[0]["amount"] == "800.00"

    audit = await _audit(client, entity_type="accounting_period", entity_id=period["id"])
    assert [row["action"] for row in audit] == ["close"]
    assert audit[0]["reason"] == "May books final"
    assert audit[0]["after"]["closing_entry_id"] == closing_entry["id"]

    r = await client.post(
        f"/api/v1/accounting/periods/{period['id']}/reopen",
        json={"reason": "Adjustment needed"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["is_closed"] is False

    entries = await _entries(client)
    voided = [
        entry
        for entry in entries
        if entry["id"] == closing_entry["id"] and entry["status"] == "void"
    ]
    assert len(voided) == 1

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(transaction_date="2026-05-15T12:00:00Z"),
    )
    assert r.status_code == 201, r.text

    audit = await _audit(client, entity_type="accounting_period", entity_id=period["id"])
    assert [row["action"] for row in audit] == ["reopen", "close"]
    assert audit[0]["reason"] == "Adjustment needed"

    closing_audit = await _audit(
        client,
        entity_type="journal_entry",
        entity_id=closing_entry["id"],
    )
    actions = {row["action"] for row in closing_audit}
    assert {"create", "void"} <= actions


@pytest.mark.asyncio
async def test_audit_log_records_settings_and_journal_creates(client):
    slug = f"p{uuid.uuid4().hex[:6]}"
    await _register(client, slug)

    r = await client.put("/api/v1/accounting/settings", json={"opening_cash": "5000.00"})
    assert r.status_code == 200, r.text

    settings_audit = await _audit(client, entity_type="accounting_settings")
    assert len(settings_audit) == 1
    row = settings_audit[0]
    assert row["action"] == "update"
    assert row["after"]["opening_cash"] == "5000.00"

    await _add(client)

    journal_audit = await _audit(client, entity_type="journal_entry", action="create")
    assert len(journal_audit) >= 2
    assert all(row["after"]["total_debit"] == row["after"]["total_credit"] for row in journal_audit)
    assert any(row["after"]["source_type"] == "opening_balance" for row in journal_audit)
    assert any(row["after"]["source_type"] == "transaction" for row in journal_audit)


@pytest.mark.asyncio
async def test_period_rbac_accountant_cannot_close_viewer_cannot_audit(client):
    from app.core.security import create_access_token

    slug = f"p{uuid.uuid4().hex[:6]}"
    tokens = await _register(client, slug)
    tenant_id = tokens["tenant_id"]
    fiscal_year = await _create_fy(client)
    period = (await _periods(client, fiscal_year["id"]))[0]

    accountant_id = await _create_role_user(
        tenant_id, "accountant", f"acct{uuid.uuid4().hex[:6]}@test.com"
    )
    client.cookies["access_token"] = create_access_token(accountant_id, tenant_id)

    r = await client.post(
        "/api/v1/accounting/fiscal-years",
        json={
            "name": "FY 2026-06",
            "start_date": "2026-06-01",
            "end_date": "2026-06-30",
        },
    )
    assert r.status_code == 201, r.text
    assert (await _audit(client)) != []

    r = await client.post(f"/api/v1/accounting/periods/{period['id']}/close", json={})
    assert r.status_code == 403, r.text

    viewer_id = await _create_role_user(tenant_id, "viewer", f"view{uuid.uuid4().hex[:6]}@test.com")
    client.cookies["access_token"] = create_access_token(viewer_id, tenant_id)
    r = await client.get("/api/v1/accounting/audit-log")
    assert r.status_code == 403, r.text

    client.cookies["access_token"] = create_access_token(tokens["user_id"], tenant_id)
    r = await client.post(f"/api/v1/accounting/periods/{period['id']}/close", json={})
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_periods_and_audit_are_tenant_isolated(client):
    from app.core.security import create_access_token

    slug_a = f"p{uuid.uuid4().hex[:6]}"
    tokens_a = await _register(client, slug_a)
    fiscal_year = await _create_fy(client)
    period = (await _periods(client, fiscal_year["id"]))[0]

    slug_b = f"p{uuid.uuid4().hex[:6]}"
    await _register(client, slug_b)
    assert await _periods(client) == []
    assert (await client.get("/api/v1/accounting/fiscal-years")).json() == []
    assert await _audit(client) == []

    r = await client.post(f"/api/v1/accounting/periods/{period['id']}/close", json={})
    assert r.status_code == 404, r.text

    client.cookies["access_token"] = create_access_token(tokens_a["user_id"], tokens_a["tenant_id"])
    r = await client.post(f"/api/v1/accounting/periods/{period['id']}/close", json={})
    assert r.status_code == 200, r.text
