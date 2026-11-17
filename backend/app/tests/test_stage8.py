"""Stage 8: chart-of-accounts management and manual journal vouchers."""

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
            "full_name": "Stage Eight",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _accounts(client):
    r = await client.get("/api/v1/accounting/accounts")
    assert r.status_code == 200, r.text
    return {a["code"]: a for a in r.json()}


def _entry_payload(accounts, *, debit="1010", credit="3010", amount="100.00", **overrides):
    base = {
        "entry_date": "2026-07-01",
        "voucher_type": "journal",
        "reference": f"MAN-{uuid.uuid4().hex[:8]}",
        "narration": "Manual test voucher",
        "lines": [
            {
                "account_id": accounts[debit]["id"],
                "debit": amount,
                "credit": "0",
                "description": "Debit line",
            },
            {
                "account_id": accounts[credit]["id"],
                "debit": "0",
                "credit": amount,
                "description": "Credit line",
            },
        ],
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_create_and_update_custom_account(client):
    await _register(client, "coa")
    r = await client.post(
        "/api/v1/accounting/accounts",
        json={
            "code": "6300",
            "name": "Marketing Expense",
            "account_type": "expense",
            "description": "Campaigns and advertising",
        },
    )
    assert r.status_code == 201, r.text
    account = r.json()
    assert account["normal_balance"] == "debit"
    assert account["is_system"] is False
    assert account["is_active"] is True

    r = await client.patch(
        f"/api/v1/accounting/accounts/{account['id']}",
        json={"name": "Marketing & Advertising", "is_active": False},
    )
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["name"] == "Marketing & Advertising"
    assert updated["is_active"] is False


@pytest.mark.asyncio
async def test_duplicate_account_code_rejected(client):
    await _register(client, "dupa")
    payload = {
        "code": "6310",
        "name": "First",
        "account_type": "expense",
    }
    r = await client.post("/api/v1/accounting/accounts", json=payload)
    assert r.status_code == 201, r.text
    r = await client.post(
        "/api/v1/accounting/accounts",
        json={**payload, "name": "Second"},
    )
    assert r.status_code == 409, r.text


@pytest.mark.asyncio
async def test_system_account_cannot_be_deactivated(client):
    await _register(client, "sysa")
    accounts = await _accounts(client)
    r = await client.patch(
        f"/api/v1/accounting/accounts/{accounts['1010']['id']}",
        json={"is_active": False},
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_manual_journal_entry_is_balanced_and_posted(client):
    await _register(client, "jrn")
    accounts = await _accounts(client)
    r = await client.post(
        "/api/v1/accounting/journal-entries",
        json=_entry_payload(accounts, amount="250.00"),
    )
    assert r.status_code == 201, r.text
    entry = r.json()
    assert entry["voucher_type"] == "journal"
    assert entry["status"] == "posted"
    assert entry["entry_no"].startswith("JRN-")
    assert len(entry["lines"]) == 2
    assert Decimal(entry["lines"][0]["debit"]) == Decimal("250.00")
    assert Decimal(entry["lines"][1]["credit"]) == Decimal("250.00")


@pytest.mark.asyncio
async def test_manual_journal_entry_must_balance(client):
    await _register(client, "jrnbad")
    accounts = await _accounts(client)
    payload = _entry_payload(accounts, amount="100.00")
    payload["lines"][1]["credit"] = "99.00"
    r = await client.post("/api/v1/accounting/journal-entries", json=payload)
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_manual_journal_entry_rejects_inactive_account(client):
    await _register(client, "jrninactive")
    accounts = await _accounts(client)
    r = await client.post(
        "/api/v1/accounting/accounts",
        json={"code": "6320", "name": "Suspense", "account_type": "asset"},
    )
    assert r.status_code == 201, r.text
    suspense = r.json()
    r = await client.patch(
        f"/api/v1/accounting/accounts/{suspense['id']}",
        json={"is_active": False},
    )
    assert r.status_code == 200, r.text
    payload = _entry_payload(accounts, credit="3010")
    payload["lines"][0]["account_id"] = suspense["id"]
    r = await client.post("/api/v1/accounting/journal-entries", json=payload)
    assert r.status_code == 422, r.text
    assert "inactive" in r.text.lower()


@pytest.mark.asyncio
async def test_accounts_are_tenant_scoped(client):
    await _register(client, "coaone")
    r = await client.post(
        "/api/v1/accounting/accounts",
        json={"code": "6400", "name": "Tenant One Account", "account_type": "expense"},
    )
    assert r.status_code == 201, r.text

    await _register(client, "coatwo")
    accounts = await _accounts(client)
    assert "6400" not in accounts


@pytest.mark.asyncio
async def test_me_exposes_effective_permissions(client):
    await _register(client, "perms")
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 200, r.text
    permissions = r.json()["permissions"]
    assert "manage_accounting" in permissions
    assert "close_period" in permissions

@pytest.mark.asyncio
async def test_account_hierarchy_cannot_cycle(client):
    await _register(client, "coacycle")
    r = await client.post(
        "/api/v1/accounting/accounts",
        json={"code": "6500", "name": "Group A", "account_type": "asset", "is_group": True},
    )
    assert r.status_code == 201, r.text
    group_a = r.json()
    r = await client.post(
        "/api/v1/accounting/accounts",
        json={
            "code": "6510",
            "name": "Group B",
            "account_type": "asset",
            "is_group": True,
            "parent_id": group_a["id"],
        },
    )
    assert r.status_code == 201, r.text
    group_b = r.json()

    r = await client.patch(
        f"/api/v1/accounting/accounts/{group_a['id']}",
        json={"parent_id": group_b["id"]},
    )
    assert r.status_code == 422, r.text
    assert "cycle" in r.text.lower()


@pytest.mark.asyncio
async def test_system_account_cannot_be_moved(client):
    await _register(client, "sysmove")
    r = await client.post(
        "/api/v1/accounting/accounts",
        json={"code": "6520", "name": "Asset Group", "account_type": "asset", "is_group": True},
    )
    assert r.status_code == 201, r.text
    group = r.json()
    accounts = await _accounts(client)
    r = await client.patch(
        f"/api/v1/accounting/accounts/{accounts['1010']['id']}",
        json={"parent_id": group["id"]},
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_manual_journal_entry_rejects_other_tenant_account(client):
    await _register(client, "jrnowner")
    r = await client.post(
        "/api/v1/accounting/accounts",
        json={"code": "6530", "name": "Owner Only", "account_type": "expense"},
    )
    assert r.status_code == 201, r.text
    foreign_account = r.json()

    await _register(client, "jrnother")
    accounts = await _accounts(client)
    payload = _entry_payload(accounts, credit="3010")
    payload["lines"][0]["account_id"] = foreign_account["id"]
    r = await client.post("/api/v1/accounting/journal-entries", json=payload)
    assert r.status_code == 422, r.text
    assert "unknown account" in r.text.lower()


@pytest.mark.asyncio
async def test_manual_journal_entry_blocked_in_closed_period(client):
    await _register(client, "jrnclosed")
    accounts = await _accounts(client)
    r = await client.post(
        "/api/v1/accounting/fiscal-years",
        json={"name": "FY 2026-07", "start_date": "2026-07-01", "end_date": "2026-07-31"},
    )
    assert r.status_code == 201, r.text
    fiscal_year = r.json()
    r = await client.get(f"/api/v1/accounting/periods?fiscal_year_id={fiscal_year['id']}")
    assert r.status_code == 200, r.text
    period = r.json()[0]

    r = await client.post(
        f"/api/v1/accounting/periods/{period['id']}/close",
        json={"reason": "July closed"},
    )
    assert r.status_code == 200, r.text

    r = await client.post(
        "/api/v1/accounting/journal-entries",
        json=_entry_payload(accounts),
    )
    assert r.status_code == 422, r.text
    assert "closed" in r.text.lower()

