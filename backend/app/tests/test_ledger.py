"""End-to-end tests for the double-entry posting engine.

Every write goes through the public API so the test exercises the same path a
real tenant would: transaction service -> PostingService -> journal tables.
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select


async def _register(client, slug):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": slug,
            "email": f"{slug}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Ledger Owner",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _tx(**overrides):
    base = {
        "type": "sale",
        "transaction_date": "2026-05-01T12:00:00Z",
        "amount": "150.00",
        "external_id": f"LED-{uuid.uuid4().hex[:10]}",
        "currency": "NPR",
        "description": "ledger test",
    }
    base.update(overrides)
    return base


async def _accounts(client):
    r = await client.get("/api/v1/accounting/accounts")
    assert r.status_code == 200, r.text
    return {a["code"]: a for a in r.json()}


async def _entries(client, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    r = await client.get(f"/api/v1/accounting/journal-entries?{query}")
    assert r.status_code == 200, r.text
    return r.json()


async def _entry_for(client, tx_id, status=None, **params):
    tx_id = str(tx_id)
    entries = await _entries(client, limit=500, **params)
    matches = [
        e
        for e in entries
        if e["source_id"] == tx_id and (status is None or e["status"] == status)
    ]
    assert len(matches) == 1, matches
    return matches[0]


def _by_code(entry, accounts):
    """Map account code -> (debit, credit) for an entry."""
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


def _assert_balanced(entry):
    debit = sum(Decimal(line["debit"]) for line in entry["lines"])
    credit = sum(Decimal(line["credit"]) for line in entry["lines"])
    assert debit == credit
    assert debit > 0


@pytest.mark.asyncio
async def test_sale_posts_receivable_revenue_vat_and_cogs(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")
    accounts = await _accounts(client)

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(
            amount="150.00",
            tax_amount="20.00",
            metadata={"cost_amount": "40.00"},
        ),
    )
    assert r.status_code == 201, r.text
    tx_id = r.json()["id"]

    entry = await _entry_for(client, tx_id)
    assert entry["voucher_type"] == "sales"
    assert entry["status"] == "posted"
    _assert_balanced(entry)

    lines = _by_code(entry, accounts)
    assert lines["1030"] == (Decimal("150.00"), Decimal("0"))
    assert lines["4000"] == (Decimal("0"), Decimal("130.00"))
    assert lines["2030"] == (Decimal("0"), Decimal("20.00"))
    assert lines["5000"] == (Decimal("40.00"), Decimal("0"))
    assert lines["1050"] == (Decimal("0"), Decimal("40.00"))


@pytest.mark.asyncio
async def test_sale_without_cost_has_no_cogs_lines(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")
    accounts = await _accounts(client)

    r = await client.post("/api/v1/transactions", json=_tx(amount="100.00"))
    assert r.status_code == 201, r.text
    entry = await _entry_for(client, r.json()["id"])

    lines = _by_code(entry, accounts)
    assert "5000" not in lines
    assert "1050" not in lines
    assert lines["1030"] == (Decimal("100.00"), Decimal("0"))
    assert lines["4000"] == (Decimal("0"), Decimal("100.00"))


@pytest.mark.asyncio
async def test_receipt_posts_cash_and_clears_receivable(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")
    accounts = await _accounts(client)

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(type="receipt", amount="75.50", description="customer payment"),
    )
    assert r.status_code == 201, r.text
    entry = await _entry_for(client, r.json()["id"])

    assert entry["voucher_type"] == "receipt"
    _assert_balanced(entry)
    lines = _by_code(entry, accounts)
    assert lines["1010"] == (Decimal("75.50"), Decimal("0"))
    assert lines["1030"] == (Decimal("0"), Decimal("75.50"))


@pytest.mark.asyncio
async def test_purchase_posts_inventory_input_vat_and_cash(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")
    accounts = await _accounts(client)

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(type="purchase", amount="113.00", tax_amount="13.00"),
    )
    assert r.status_code == 201, r.text
    entry = await _entry_for(client, r.json()["id"])

    assert entry["voucher_type"] == "purchase"
    _assert_balanced(entry)
    lines = _by_code(entry, accounts)
    assert lines["1050"] == (Decimal("100.00"), Decimal("0"))
    assert lines["1070"] == (Decimal("13.00"), Decimal("0"))
    assert lines["1010"] == (Decimal("0"), Decimal("113.00"))


@pytest.mark.asyncio
async def test_expense_honours_metadata_account_code(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")
    accounts = await _accounts(client)

    r = await client.post(
        "/api/v1/transactions",
        json=_tx(
            type="expense",
            amount="60.00",
            description="office rent",
            metadata={"account_code": "6020"},
        ),
    )
    assert r.status_code == 201, r.text
    entry = await _entry_for(client, r.json()["id"])

    assert entry["voucher_type"] == "expense"
    _assert_balanced(entry)
    lines = _by_code(entry, accounts)
    assert lines["6020"] == (Decimal("60.00"), Decimal("0"))
    assert lines["1010"] == (Decimal("0"), Decimal("60.00"))


@pytest.mark.asyncio
async def test_reversal_is_contra_entry_and_keeps_original(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")
    accounts = await _accounts(client)

    r = await client.post("/api/v1/transactions", json=_tx(amount="90.00"))
    assert r.status_code == 201, r.text
    original_tx = r.json()["id"]
    original = await _entry_for(client, original_tx)

    r = await client.post(f"/api/v1/transactions/{original_tx}/reverse")
    assert r.status_code == 200, r.text
    reversal_tx = r.json()["id"]

    reversal = await _entry_for(client, reversal_tx)
    assert reversal["voucher_type"] == "reversal"
    assert reversal["reversal_of_id"] == original["id"]
    _assert_balanced(reversal)

    lines = _by_code(reversal, accounts)
    assert lines["1030"] == (Decimal("0"), Decimal("90.00"))
    assert lines["4000"] == (Decimal("90.00"), Decimal("0"))

    # The original entry is untouched; the contra entry cancels it in reports.
    still = await _entry_for(client, original_tx)
    assert still["id"] == original["id"]
    assert still["status"] == "posted"


@pytest.mark.asyncio
async def test_update_voids_old_entry_and_posts_new_one(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")
    accounts = await _accounts(client)

    r = await client.post("/api/v1/transactions", json=_tx(amount="100.00"))
    assert r.status_code == 201, r.text
    tx_id = r.json()["id"]
    first = await _entry_for(client, tx_id)

    r = await client.patch(
        f"/api/v1/transactions/{tx_id}", json={"amount": "125.00"}
    )
    assert r.status_code == 200, r.text

    entries = await _entries(client, limit=500)
    mine = [e for e in entries if e["source_id"] == tx_id]
    active = [e for e in mine if e["status"] == "posted"]
    voided = [e for e in mine if e["status"] == "void"]
    assert len(active) == 1
    assert len(voided) == 1
    assert voided[0]["id"] == first["id"]

    lines = _by_code(active[0], accounts)
    assert lines["1030"] == (Decimal("125.00"), Decimal("0"))
    assert lines["4000"] == (Decimal("0"), Decimal("125.00"))


@pytest.mark.asyncio
async def test_delete_voids_the_journal_entry(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")

    r = await client.post("/api/v1/transactions", json=_tx(amount="10.00"))
    assert r.status_code == 201, r.text
    tx_id = r.json()["id"]
    entry = await _entry_for(client, tx_id)

    r = await client.delete(f"/api/v1/transactions/{tx_id}")
    assert r.status_code == 204, r.text

    voided = await _entry_for(client, tx_id)
    assert voided["id"] == entry["id"]
    assert voided["status"] == "void"


@pytest.mark.asyncio
async def test_journal_entries_are_tenant_isolated(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")
    r = await client.post("/api/v1/transactions", json=_tx(amount="33.00"))
    assert r.status_code == 201, r.text
    other_entry = await _entry_for(client, r.json()["id"])

    await _register(client, f"l{uuid.uuid4().hex[:6]}")

    entries = await _entries(client, limit=500)
    assert other_entry["id"] not in [e["id"] for e in entries]

    r = await client.get(
        f"/api/v1/accounting/journal-entries/{other_entry['id']}"
    )
    assert r.status_code == 404, r.text


@pytest.mark.asyncio
async def test_accounts_and_filters_are_scoped(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")
    accounts = await _accounts(client)
    assert len(accounts) == 60
    assert accounts["1030"]["account_type"] == "asset"
    assert accounts["4000"]["account_type"] == "income"

    sale = await client.post("/api/v1/transactions", json=_tx(amount="11.00"))
    assert sale.status_code == 201, sale.text
    receipt = await client.post(
        "/api/v1/transactions", json=_tx(type="receipt", amount="5.00")
    )
    assert receipt.status_code == 201, receipt.text

    sales = await _entries(client, voucher_type="sales", limit=500)
    receipts = await _entries(client, voucher_type="receipt", limit=500)
    assert [e["source_id"] for e in sales] == [sale.json()["id"]]
    assert [e["source_id"] for e in receipts] == [receipt.json()["id"]]

    only_sales = await _accounts(client)
    assert all(a["account_type"] in {"asset", "liability", "equity", "income", "expense"}
               for a in only_sales.values())


async def _create_product(client, name):
    r = await client.post(
        "/api/v1/products",
        json={
            "name": name,
            "variants": [
                {
                    "name": "Default",
                    "sku": f"VAR-{name}-{uuid.uuid4().hex[:6]}",
                    "stock_quantity": 100,
                    "prices": [{"price": "10.00"}],
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_customer(client, name="Ledger Co"):
    r = await client.post(
        "/api/v1/customers",
        json={"name": name, "email": f"{uuid.uuid4().hex[:8]}@acme.com"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_order(client, product, customer=None, quantity="2.00"):
    r = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["id"] if customer else None,
            "delivery_address": "123 Main St",
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": quantity,
                    "unit_price": "10.00",
                }
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _mark_delivered(order_id):
    from sqlalchemy import select

    from app.core.database import get_session
    from app.modules.orders.models import Order

    async with get_session() as session:
        order = (
            await session.execute(select(Order).where(Order.id == order_id))
        ).scalar_one()
        order.status = "delivered"
        await session.commit()


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
        return user.id


@pytest.mark.asyncio
async def test_delivery_completion_posts_sale_entry(client):
    tokens = await _register(client, f"l{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    accounts = await _accounts(client)
    product = await _create_product(client, f"P{uuid.uuid4().hex[:6]}")
    order = await _create_order(client, product, quantity="1.00")

    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "confirmed"})
    assert r.status_code == 200, r.text
    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "ready"})
    assert r.status_code == 200, r.text

    agent_id = await _create_role_user(
        tenant_id, "delivery", f"ag{uuid.uuid4().hex[:6]}@test.com"
    )
    r = await client.get("/api/v1/deliveries")
    delivery = next(d for d in r.json() if d["order_id"] == order["id"])

    r = await client.patch(
        f"/api/v1/deliveries/{delivery['id']}/assign",
        json={"delivery_agent_id": str(agent_id)},
    )
    assert r.status_code == 200, r.text
    for state in ("picked_up", "in_transit"):
        r = await client.patch(
            f"/api/v1/deliveries/{delivery['id']}", json={"status": state}
        )
        assert r.status_code == 200, r.text
    r = await client.patch(
        f"/api/v1/deliveries/{delivery['id']}", json={"status": "delivered"}
    )
    assert r.status_code == 200, r.text

    r = await client.get("/api/v1/transactions?type=sale&limit=50")
    sale = next(
        t for t in r.json() if "auto" in (t.get("description") or "").lower()
    )
    entry = await _entry_for(client, sale["id"])
    assert entry["voucher_type"] == "sales"
    _assert_balanced(entry)
    lines = _by_code(entry, accounts)
    assert lines["1030"] == (Decimal("10.00"), Decimal("0"))
    assert lines["4000"] == (Decimal("0"), Decimal("10.00"))


@pytest.mark.asyncio
async def test_khata_payment_posts_and_void_reverses(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")
    accounts = await _accounts(client)
    product = await _create_product(client, f"P{uuid.uuid4().hex[:6]}")
    customer = await _create_customer(client)
    order = await _create_order(client, product, customer)
    r = await client.patch(f"/api/v1/orders/{order['id']}", json={"status": "confirmed"})
    assert r.status_code == 200, r.text
    await _mark_delivered(order["id"])

    r = await client.post(
        "/api/v1/khata/payments",
        json={"customer_id": customer["id"], "amount": "20.00", "method": "cash"},
    )
    assert r.status_code == 201, r.text
    payment = r.json()

    r = await client.get("/api/v1/transactions?type=receipt&limit=50")
    receipts = r.json()
    receipt_tx = next(
        t
        for t in receipts
        if (t.get("metadata") or {}).get("ledger_entry_id") == payment["id"]
    )
    entry = await _entry_for(client, receipt_tx["id"])
    assert entry["voucher_type"] == "receipt"
    _assert_balanced(entry)
    lines = _by_code(entry, accounts)
    assert lines["1010"] == (Decimal("20.00"), Decimal("0"))
    assert lines["1030"] == (Decimal("0"), Decimal("20.00"))

    r = await client.post(
        f"/api/v1/khata/payments/{payment['id']}/void",
        json={"reason": "wrong amount"},
    )
    assert r.status_code == 200, r.text

    r = await client.get("/api/v1/transactions?type=receipt&limit=50")
    reversal_tx = next(
        t for t in r.json() if (t.get("metadata") or {}).get("voided") is True
    )
    reversal = await _entry_for(client, reversal_tx["id"])
    assert reversal["voucher_type"] == "reversal"
    assert reversal["reversal_of_id"] == entry["id"]
    _assert_balanced(reversal)
    reversed_lines = _by_code(reversal, accounts)
    assert reversed_lines["1010"] == (Decimal("0"), Decimal("20.00"))
    assert reversed_lines["1030"] == (Decimal("20.00"), Decimal("0"))


def _check(report, name):
    return next(line for line in report["lines"] if line["check"] == name)


@pytest.mark.asyncio
async def test_reconciliation_matches_core_ledger(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")

    for payload in (
        _tx(amount="100.00"),
        _tx(type="receipt", amount="40.00"),
        _tx(type="expense", amount="10.00"),
        _tx(type="purchase", amount="20.00"),
    ):
        r = await client.post("/api/v1/transactions", json=payload)
        assert r.status_code == 201, r.text

    r = await client.get("/api/v1/accounting/reconciliation")
    assert r.status_code == 200, r.text
    report = r.json()
    assert report["transactions_total"] == 4
    assert report["transactions_posted"] == 4
    assert report["transactions_unpostable"] == 0
    assert report["transactions_missing"] == 0
    assert report["duplicate_active_entries"] == 0
    assert report["unbalanced_entries"] == 0

    assert _check(report, "Journal debits = credits")["status"] == "matched"
    ar = _check(report, "Accounts receivable")
    assert ar["gl_amount"] == "60.00"
    assert ar["legacy_amount"] == "60.00"
    assert ar["status"] == "matched"
    cash = _check(report, "Cash & bank")
    assert cash["gl_amount"] == "10.00"
    assert cash["legacy_amount"] == "10.00"
    assert cash["status"] == "matched"
    revenue = _check(report, "Sales revenue")
    assert revenue["gl_amount"] == "100.00"
    assert revenue["status"] == "matched"
    opex = _check(report, "Operating expenses")
    assert opex["gl_amount"] == "10.00"
    assert opex["status"] == "matched"
    assert _check(report, "Cost of goods sold")["status"] == "informational"
    assert _check(report, "VAT payable (net)")["status"] == "informational"


@pytest.mark.asyncio
async def test_reconciliation_flags_unpostable_transactions(client):
    await _register(client, f"l{uuid.uuid4().hex[:6]}")

    r = await client.post("/api/v1/transactions", json=_tx(amount="0.00"))
    assert r.status_code == 201, r.text
    r = await client.post(
        "/api/v1/transactions", json=_tx(amount="100.00", tax_amount="120.00")
    )
    assert r.status_code == 201, r.text

    r = await client.get("/api/v1/accounting/reconciliation")
    report = r.json()
    assert report["transactions_total"] == 2
    assert report["transactions_posted"] == 0
    assert report["transactions_unpostable"] == 2
    assert report["transactions_missing"] == 0
    assert any("not postable" in note for note in report["notes"])


@pytest.mark.asyncio
async def test_opening_balances_post_once_and_reconcile(client):
    slug = f"l{uuid.uuid4().hex[:6]}"
    tokens = await _register(client, slug)
    tenant_id = tokens["tenant_id"]
    accounts = await _accounts(client)

    r = await client.put(
        "/api/v1/accounting/settings",
        json={
            "opening_cash": "1000.00",
            "opening_inventory": "500.00",
            "opening_payables": "300.00",
            "opening_capital": "1200.00",
        },
    )
    assert r.status_code == 200, r.text

    from app.core.database import get_session
    from app.modules.accounting.posting import PostingService
    from app.modules.accounting.repository import AccountingRepository
    from app.modules.tenants.models import Tenant

    async with get_session() as session:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one()
        settings = await AccountingRepository(session, tenant.id).ensure_settings()
        first = await PostingService(session, tenant.id).post_opening_balances(
            settings, entry_date=date(2026, 1, 1)
        )
        second = await PostingService(session, tenant.id).post_opening_balances(
            settings, entry_date=date(2026, 1, 1)
        )
    assert first is not None
    assert second is not None and second.id == first.id

    entries = await _entries(client, voucher_type="opening", limit=50)
    assert len(entries) == 1
    _assert_balanced(entries[0])
    lines = _by_code(entries[0], accounts)
    assert lines["1010"] == (Decimal("1000.00"), Decimal("0"))
    assert lines["1050"] == (Decimal("500.00"), Decimal("0"))
    assert lines["2010"] == (Decimal("0"), Decimal("300.00"))
    assert lines["3010"] == (Decimal("0"), Decimal("1200.00"))

    r = await client.get("/api/v1/accounting/reconciliation")
    report = r.json()
    cash = _check(report, "Cash & bank")
    assert cash["gl_amount"] == "1000.00"
    assert cash["legacy_amount"] == "1000.00"
    assert cash["status"] == "matched"
    inventory = _check(report, "Inventory")
    assert inventory["gl_amount"] == "500.00"
    assert inventory["legacy_amount"] == "500.00"
    assert inventory["status"] == "informational"


@pytest.mark.asyncio
async def test_unbalanced_openings_plug_to_equity(client):
    slug = f"l{uuid.uuid4().hex[:6]}"
    tokens = await _register(client, slug)
    tenant_id = tokens["tenant_id"]
    accounts = await _accounts(client)

    r = await client.put(
        "/api/v1/accounting/settings",
        json={"opening_cash": "1000.00", "opening_payables": "300.00"},
    )
    assert r.status_code == 200, r.text

    from app.core.database import get_session
    from app.modules.accounting.posting import PostingService
    from app.modules.accounting.repository import AccountingRepository
    from app.modules.tenants.models import Tenant

    async with get_session() as session:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one()
        settings = await AccountingRepository(session, tenant.id).ensure_settings()
        await PostingService(session, tenant.id).post_opening_balances(
            settings, entry_date=date(2026, 1, 1)
        )

    entries = await _entries(client, voucher_type="opening", limit=50)
    lines = _by_code(entries[0], accounts)
    assert lines["3090"] == (Decimal("0"), Decimal("700.00"))

    r = await client.get("/api/v1/accounting/reconciliation")
    report = r.json()
    plug = _check(report, "Opening balance equity plug")
    assert plug["gl_amount"] == "700.00"
    assert plug["status"] == "informational"
    assert any("Opening Balance Equity" in note for note in report["notes"])


@pytest.mark.asyncio
async def test_backfill_script_posts_legacy_transactions(client):
    slug = f"l{uuid.uuid4().hex[:6]}"
    tokens = await _register(client, slug)
    tenant_id = tokens["tenant_id"]

    from app.core.database import get_session
    from app.modules.tenants.models import Tenant
    from app.modules.transactions.models import Transaction
    from scripts.backfill_ledger import backfill_tenant

    async with get_session() as session:
        legacy = Transaction(
            tenant_id=tenant_id,
            type="sale",
            transaction_date=datetime(2026, 4, 1, 12, tzinfo=UTC),
            external_id=f"LEGACY-{uuid.uuid4().hex[:8]}",
            amount=Decimal("50.00"),
            currency="NPR",
            description="legacy sale",
        )
        session.add(legacy)
        await session.commit()
        legacy_id = legacy.id

    r = await client.get("/api/v1/accounting/reconciliation")
    assert r.json()["transactions_missing"] == 1

    async with get_session() as session:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one()
        result = await backfill_tenant(session, tenant)
        await session.commit()
    assert result.posted == 1
    assert result.failed == 0

    r = await client.get("/api/v1/accounting/reconciliation")
    report = r.json()
    assert report["transactions_missing"] == 0
    assert report["transactions_posted"] == 1

    entry = await _entry_for(client, legacy_id)
    assert entry["voucher_type"] == "sales"
    assert entry["status"] == "posted"

    async with get_session() as session:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one()
        again = await backfill_tenant(session, tenant)
        await session.commit()
    assert again.existing == 1
    assert again.posted == 0
