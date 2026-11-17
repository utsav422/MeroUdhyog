"""Stage 9: GL cutover readiness and controlled report-engine switching."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select

from scripts.cutover_readiness import check_tenant
from scripts.set_report_engine import build_parser as build_switch_parser
from scripts.set_report_engine import run as run_switch


async def _register(client, slug):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": f"{slug}{uuid.uuid4().hex[:6]}",
            "email": f"{slug}{uuid.uuid4().hex[:6]}@test.com",
            "password": "Sup3rSecret!2026",
            "full_name": "Cutover Owner",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _tenant(session, tenant_id):
    from app.modules.tenants.models import Tenant

    return (
        await session.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one()


async def _settings_engine(client):
    r = await client.get("/api/v1/accounting/settings")
    assert r.status_code == 200, r.text
    return r.json()["report_engine"]


@pytest.mark.asyncio
async def test_readiness_passes_for_fully_posted_tenant(client):
    tokens = await _register(client, "cutready")
    r = await client.post(
        "/api/v1/transactions",
        json={
            "type": "sale",
            "transaction_date": "2026-05-10T12:00:00Z",
            "amount": "1000.00",
            "external_id": f"CUT-{uuid.uuid4().hex[:8]}",
            "currency": "NPR",
            "description": "cutover sale",
        },
    )
    assert r.status_code == 201, r.text

    from app.core.database import get_session

    async with get_session() as session:
        tenant = await _tenant(session, tokens["tenant_id"])
        result = await check_tenant(session, tenant)

    assert result.ready is True
    assert result.engine == "legacy"
    assert result.transactions_missing == 0
    assert result.transactions_unpostable == 0
    assert result.core_mismatches == []


@pytest.mark.asyncio
async def test_readiness_blocks_unposted_legacy_transaction(client):
    tokens = await _register(client, "cutmiss")
    from app.core.database import get_session
    from app.modules.transactions.models import Transaction

    async with get_session() as session:
        session.add(
            Transaction(
                tenant_id=tokens["tenant_id"],
                type="sale",
                transaction_date=datetime(2026, 5, 11, 12, tzinfo=UTC),
                external_id=f"MISS-{uuid.uuid4().hex[:8]}",
                amount=Decimal("50.00"),
                currency="NPR",
                description="legacy sale without GL",
            )
        )
        await session.commit()

    async with get_session() as session:
        tenant = await _tenant(session, tokens["tenant_id"])
        result = await check_tenant(session, tenant)

    assert result.ready is False
    assert result.transactions_missing == 1


@pytest.mark.asyncio
async def test_switch_script_is_dry_run_by_default(client):
    tokens = await _register(client, "cutdry")
    slug = (await client.get("/api/v1/tenants/me")).json()["slug"]
    assert tokens["tenant_id"]

    args = build_switch_parser().parse_args(["--engine", "gl", "--tenant", slug])
    assert await run_switch(args) == 0
    assert await _settings_engine(client) == "legacy"

    args = build_switch_parser().parse_args(
        ["--engine", "gl", "--tenant", slug, "--apply"]
    )
    assert await run_switch(args) == 0
    assert await _settings_engine(client) == "gl"
