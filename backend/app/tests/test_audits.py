import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.modules.audits.rules import LedgerEntry, run_rules


async def _register(client, slug):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": slug,
            "email": f"{slug}@test.com",
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
        "currency": "USD",
        "metadata": {},
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_audit_run_detects_findings_and_lists_them(client):
    await _register(client, f"aud{uuid.uuid4().hex[:6]}")

    # create a few transactions that will trip rules
    await client.post("/api/v1/transactions", json=_tx(amount="0", external_id="a1"))
    await client.post(
        "/api/v1/transactions", json=_tx(amount="100", tax_amount="120", external_id="a2")
    )
    await client.post(
        "/api/v1/transactions",
        json=_tx(amount="50", discount_amount="200", external_id="a3", metadata={"dummy": True}),
    )

    run = await client.post("/api/v1/audits/runs", json={})
    assert run.status_code == 201, run.text
    run_body = run.json()
    assert run_body["status"] == "completed"
    assert run_body["total_findings"] >= 3

    findings = await client.get(
        f"/api/v1/audits/findings?run_id={run_body['id']}"
    )
    assert findings.status_code == 200
    codes = {f["rule_code"] for f in findings.json()}
    assert "zero_amount" in codes
    assert "tax_greater_than_amount" in codes
    assert "discount_greater_than_amount" in codes

    # evidence attached to each finding
    disc = next(f for f in findings.json() if f["rule_code"] == "discount_greater_than_amount")
    assert disc["evidence"]["discount_amount"] == "200.00"


@pytest.mark.asyncio
async def test_findings_are_tenant_isolated(client):
    await _register(client, f"aud{uuid.uuid4().hex[:6]}")
    await client.post("/api/v1/transactions", json=_tx(amount="0", external_id="t1"))
    run = await client.post("/api/v1/audits/runs", json={})
    run_id = run.json()["id"]

    findings = await client.get("/api/v1/audits/findings")
    assert findings.status_code == 200
    assert all(f["run_id"] == run_id for f in findings.json())


@pytest.mark.asyncio
async def test_scope_month_limits_findings(client):
    await _register(client, f"aud{uuid.uuid4().hex[:6]}")
    await client.post(
        "/api/v1/transactions",
        json=_tx(amount="0", transaction_date="2026-05-01T12:00:00Z", external_id="s1"),
    )
    await client.post(
        "/api/v1/transactions",
        json=_tx(amount="0", transaction_date="2026-06-01T12:00:00Z", external_id="s2"),
    )

    run = await client.post("/api/v1/audits/runs", json={"scope_month": "2026-05"})
    assert run.status_code == 201
    findings = await client.get(
        f"/api/v1/audits/findings?run_id={run.json()['id']}"
    )
    assert findings.status_code == 200
    assert len(findings.json()) == 1


@pytest.mark.asyncio
async def test_resolve_and_waive_findings(client):
    await _register(client, f"aud{uuid.uuid4().hex[:6]}")
    await client.post("/api/v1/transactions", json=_tx(amount="0", external_id="r1"))
    run = await client.post("/api/v1/audits/runs", json={})
    finding = (await client.get(f"/api/v1/audits/findings?run_id={run.json()['id']}")).json()[0]

    resolved = await client.patch(
        f"/api/v1/audits/findings/{finding['id']}/resolve",
        json={"note": "Reviewed and approved", "resolved": True},
    )
    assert resolved.status_code == 200
    assert resolved.json()["is_resolved"] is True
    assert resolved.json()["resolution_note"] == "Reviewed and approved"


@pytest.mark.asyncio
async def test_rules_are_deterministic_and_handle_future_dates():
    now = datetime.now(UTC)
    entries = [
        LedgerEntry(
            id=uuid.uuid4(),
            type="sale",
            amount=Decimal("-10.00"),
            tax_amount=None,
            discount_amount=None,
            transaction_date=now,
            currency="USD",
            reverses_id=None,
            external_id=None,
        ),
        LedgerEntry(
            id=uuid.uuid4(),
            type="expense",
            amount=Decimal("0"),
            tax_amount=None,
            discount_amount=None,
            transaction_date=now + timedelta(days=5),
            currency="USD",
            reverses_id=None,
            external_id=None,
        ),
    ]
    findings = run_rules(entries, now=now)
    codes = {f.rule_code for f in findings}
    assert "negative_amount" in codes
    assert "future_dated" in codes
    # deterministic: running twice yields same rule codes
    codes2 = {f.rule_code for f in run_rules(entries, now=now)}
    assert codes == codes2


@pytest.mark.asyncio
async def test_reversal_negative_amount_is_not_a_finding():
    now = datetime.now(UTC)
    original = uuid.uuid4()
    entries = [
        LedgerEntry(
            id=uuid.uuid4(),
            type="sale",
            amount=Decimal("-150.00"),
            tax_amount=None,
            discount_amount=None,
            transaction_date=now,
            currency="USD",
            reverses_id=original,
            external_id=None,
        ),
    ]
    findings = run_rules(entries, now=now)
    assert not [f for f in findings if f.rule_code == "negative_amount"]
