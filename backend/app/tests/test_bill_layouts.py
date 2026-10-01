import uuid

import pytest
from sqlalchemy import select

from app.core.database import get_session
from app.core.security import create_access_token
from app.modules.khata.layout import normalize_layout
from app.modules.khata.models import BillLayout, BillTemplate, LedgerEntry
from app.tests.test_khata import (
    _create_customer,
    _create_order,
    _create_product,
    _create_role_user,
    _deliver_order,
    _pay,
    _place_order,
    _register,
)

BASE = "/api/v1/khata/settings/bill-layouts"


def _reordered(base: dict) -> dict:
    """Put totals first + centre branding so the PDF visibly changes."""
    blocks = [b for b in base["blocks"] if b["id"] == "totals"] + [
        b for b in base["blocks"] if b["id"] != "totals"
    ]
    for block in blocks:
        if block["id"] == "branding":
            block["align"] = "center"
    return {"blocks": blocks}


async def _create_preset(client, name, layout=None):
    if layout is None:
        layout = normalize_layout((await client.get(BASE)).json()[0]["layout"])
    else:
        layout = normalize_layout(layout)
    r = await client.post(BASE, json={"name": name, "layout": layout})
    assert r.status_code == 201, r.text
    return r.json()


async def _switch_default(client, preset_id, doc_type):
    r = await client.post(f"{BASE}/{preset_id}/default", json={"doc_type": doc_type})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_get_layouts_lazily_seeds_standard_preset(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")

    r = await client.get(BASE)
    assert r.status_code == 200, r.text
    layouts = r.json()
    assert len(layouts) == 1
    preset = layouts[0]
    assert preset["name"] == "Standard"
    assert preset["is_default_invoice"] is True
    assert preset["is_default_receipt"] is True
    # Seeded from the app's default layout, so it is complete + normalized.
    assert [b["id"] for b in preset["layout"]["blocks"]][:2] == ["branding", "document_meta"]


@pytest.mark.asyncio
async def test_get_layouts_seeds_standard_from_saved_template_layout(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")

    # Save a custom order on the (legacy) bill template first.
    r = await client.get("/api/v1/khata/settings/bill-template")
    saved = _reordered(r.json()["layout"])
    r = await client.put("/api/v1/khata/settings/bill-template", json={"layout": saved})
    assert r.status_code == 200

    r = await client.get(BASE)
    preset = r.json()[0]
    assert preset["layout"]["blocks"][0]["id"] == "totals"


@pytest.mark.asyncio
async def test_first_created_preset_becomes_default_for_both(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = uuid.UUID(tokens["tenant_id"])

    # Simulate a tenant with no presets at all (pre-dates the feature).
    async with get_session() as session:
        for row in (
            await session.execute(select(BillLayout).where(BillLayout.tenant_id == tenant_id))
        ).scalars().all():
            await session.delete(row)
        await session.commit()

    base = normalize_layout(
        (await client.get("/api/v1/khata/settings/bill-template")).json()["layout"]
    )
    first = await _create_preset(client, "Compact", base)
    assert first["is_default_invoice"] is True
    assert first["is_default_receipt"] is True

    # A second preset is NOT automatically a default.
    second = await _create_preset(client, "Detailed", base)
    assert second["is_default_invoice"] is False
    assert second["is_default_receipt"] is False

    # Exactly one default per doc type is persisted.
    layouts = (await client.get(BASE)).json()
    assert len([p for p in layouts if p["is_default_invoice"]]) == 1
    assert len([p for p in layouts if p["is_default_receipt"]]) == 1


@pytest.mark.asyncio
async def test_switching_default_is_atomic(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    first = (await client.get(BASE)).json()[0]
    second = await _create_preset(client, "Alt")

    await _switch_default(client, second["id"], "invoice")
    layouts = (await client.get(BASE)).json()
    invoice_defaults = [p["id"] for p in layouts if p["is_default_invoice"]]
    receipt_defaults = [p["id"] for p in layouts if p["is_default_receipt"]]
    assert invoice_defaults == [second["id"]]
    assert receipt_defaults == [first["id"]]  # untouched

    # Switching receipts too leaves exactly one default per doc type.
    await _switch_default(client, second["id"], "receipt")
    layouts = (await client.get(BASE)).json()
    assert [p["id"] for p in layouts if p["is_default_invoice"]] == [second["id"]]
    assert [p["id"] for p in layouts if p["is_default_receipt"]] == [second["id"]]

    # Switching back to the first preset for invoices only.
    await _switch_default(client, first["id"], "invoice")
    layouts = (await client.get(BASE)).json()
    by_name = {p["name"]: p for p in layouts}
    assert by_name["Standard"]["is_default_invoice"] is True
    assert by_name["Standard"]["is_default_receipt"] is False
    assert by_name["Alt"]["is_default_invoice"] is False
    assert by_name["Alt"]["is_default_receipt"] is True


@pytest.mark.asyncio
async def test_delete_blocked_for_defaults(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    seeded = (await client.get(BASE)).json()[0]
    extra = await _create_preset(client, "Spare")

    # Seeded preset is the default for both.
    r = await client.delete(f"{BASE}/{seeded['id']}")
    assert r.status_code == 409
    assert "in use" in r.json()["detail"].lower()

    await _switch_default(client, extra["id"], "invoice")
    r = await client.delete(f"{BASE}/{extra['id']}")
    assert r.status_code == 409
    assert "in use" in r.json()["detail"].lower()

    # Only the receipt default is still in use, so still blocked.
    await _switch_default(client, seeded["id"], "invoice")
    r = await client.delete(f"{BASE}/{seeded['id']}")
    assert r.status_code == 409

    r = await client.delete(f"{BASE}/{extra['id']}")
    assert r.status_code == 204
    assert len((await client.get(BASE)).json()) == 1


@pytest.mark.asyncio
async def test_delete_blocked_for_last_preset(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    only = (await client.get(BASE)).json()[0]

    # Make it non-default first — there is still nothing else to delete.
    async with get_session() as session:
        row = (
            await session.execute(
                select(BillLayout).where(BillLayout.id == uuid.UUID(only["id"]))
            )
        ).scalar_one()
        row.is_default_invoice = False
        row.is_default_receipt = False
        await session.commit()

    r = await client.delete(f"{BASE}/{only['id']}")
    assert r.status_code == 409
    assert "last layout" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tenant_isolation_on_layout_presets(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    mine = (await client.get(BASE)).json()[0]
    other_tenant = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    theirs = (await client.get(BASE)).json()[0]
    assert mine["id"] != theirs["id"]

    # Tenant B cannot read, modify or delete tenant A's presets.
    r = await client.get(BASE)
    assert [p["id"] for p in r.json()] == [theirs["id"]]

    r = await client.put(f"{BASE}/{mine['id']}", json={"name": "Stolen"})
    assert r.status_code == 404

    r = await client.delete(f"{BASE}/{mine['id']}")
    assert r.status_code == 404

    r = await client.post(f"{BASE}/{mine['id']}/default", json={"doc_type": "invoice"})
    assert r.status_code == 404

    # Tenant A's preset is untouched by all of it.
    client.cookies["access_token"] = create_access_token(
        _owner_id(other_tenant), other_tenant["tenant_id"]
    )
    r = await client.get(BASE)
    assert [p["name"] for p in r.json()] == ["Standard"]


def _owner_id(tokens):
    return tokens["user_id"]


@pytest.mark.asyncio
async def test_layout_validation_and_owner_only(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    base = (await client.get(BASE)).json()[0]["layout"]

    # Unknown block id -> 422.
    r = await client.post(BASE, json={"name": "Bad", "layout": {"blocks": [{"id": "nope"}]}})
    assert r.status_code == 422

    # Malformed block -> 422.
    r = await client.post(
        BASE,
        json={"name": "Bad", "layout": {"blocks": [{"id": "customer", "enabled": "nope"}]}},
    )
    assert r.status_code == 422

    # Missing blocks list -> 422.
    r = await client.post(BASE, json={"name": "Bad", "layout": {"nope": []}})
    assert r.status_code == 422

    # Bad align -> 422.
    bad_align = {
        "blocks": [
            dict(b, align="diagonal") if b["id"] == "branding" else b for b in base["blocks"]
        ]
    }
    r = await client.post(BASE, json={"name": "Bad", "layout": bad_align})
    assert r.status_code == 422

    # A valid layout is accepted and persisted.
    preset = await _create_preset(client, "Good", _reordered(base))
    assert preset["layout"]["blocks"][0]["id"] == "totals"
    assert next(b for b in preset["layout"]["blocks"] if b["id"] == "branding")["align"] == "center"

    # Only owner/admin (MANAGE_BILL_TEMPLATE) can manage layouts.
    collector_id = await _create_role_user(
        tokens["tenant_id"], "collector", f"c{uuid.uuid4().hex[:6]}@test.com"
    )
    client.cookies["access_token"] = create_access_token(collector_id, tokens["tenant_id"])
    r = await client.get(BASE)
    assert r.status_code == 403
    r = await client.post(BASE, json={"name": "X", "layout": base})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_rename_and_duplicate_presets(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    base = (await client.get(BASE)).json()[0]["layout"]
    first = await _create_preset(client, "First", _reordered(base))

    r = await client.put(f"{BASE}/{first['id']}", json={"name": "Renamed"})
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"
    renamed_layout = r.json()["layout"]

    # Duplicate names are rejected.
    r = await client.put(f"{BASE}/{first['id']}", json={"name": "Standard"})
    assert r.status_code == 409

    # Duplicate the layout under a new name.
    second = await _create_preset(client, "Second", renamed_layout)
    assert second["id"] != first["id"]
    assert second["layout"]["blocks"][0]["id"] == "totals"

    # A layout update alone leaves the defaults alone.
    r = await client.put(
        f"{BASE}/{second['id']}", json={"layout": normalize_layout(base)}
    )
    assert r.status_code == 200
    assert r.json()["layout"]["blocks"][0]["id"] == "branding"
    assert r.json()["is_default_invoice"] is False
    assert r.json()["is_default_receipt"] is False


@pytest.mark.asyncio
async def test_old_invoice_pdf_uses_new_default_layout(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Sauce")
    customer = await _create_customer(client)
    order = await _create_order(client, product, customer)
    await _place_order(client, order["id"])
    await _deliver_order(order["id"])

    # Issue the invoice BEFORE any layout exists, so its snapshot predates
    # the bill-layouts feature entirely.
    r = await client.get(f"/api/v1/khata/orders/{order['id']}/invoice")
    assert r.status_code == 200
    assert r.json()["snapshot"] is not None
    assert "layout" not in r.json()["snapshot"]

    before = await client.get(f"/api/v1/khata/orders/{order['id']}/invoice/pdf")
    assert before.status_code == 200

    base = (await client.get(BASE)).json()[0]["layout"]
    alt = await _create_preset(client, "Totals first", _reordered(base))
    await _switch_default(client, alt["id"], "invoice")

    after = await client.get(f"/api/v1/khata/orders/{order['id']}/invoice/pdf")
    assert after.status_code == 200
    assert after.content.startswith(b"%PDF")
    # Rendering picked up the newly-selected default layout.
    assert after.content != before.content

    # The old snapshot is untouched (still no layout key).
    r = await client.get(f"/api/v1/khata/orders/{order['id']}/invoice")
    assert "layout" not in r.json()["snapshot"]


@pytest.mark.asyncio
async def test_receipt_pdf_uses_receipt_default_layout(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Ketchup")
    customer = await _create_customer(client)
    order = await _create_order(client, product, customer)
    await _place_order(client, order["id"])
    await _deliver_order(order["id"])
    payment = await _pay(client, customer["id"], "20.00")

    r = await client.get(f"/api/v1/khata/receipts/{payment['id']}")
    assert r.json()["snapshot"] is not None
    assert "layout" not in r.json()["snapshot"]

    base = (await client.get(BASE)).json()[0]["layout"]
    # Drop the customer block from receipts only.
    receipt_layout = {
        "blocks": [
            b
            if b["id"] != "customer"
            else {**b, "enabled": {**b["enabled"], "receipt": False}}
            for b in base["blocks"]
        ]
    }
    alt = await _create_preset(client, "No customer on receipts", receipt_layout)
    await _switch_default(client, alt["id"], "receipt")

    r = await client.get(f"/api/v1/khata/receipts/{payment['id']}/pdf")
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_bill_template_layout_field_still_returned(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")

    r = await client.get("/api/v1/khata/settings/bill-template")
    assert r.status_code == 200
    body = r.json()
    assert "layout" in body
    assert [b["id"] for b in body["layout"]["blocks"]][0] == "branding"

    # The old PUT still accepts a layout for back-compat and writes it to the
    # deprecated bill_templates.layout column.
    reordered = _reordered(body["layout"])
    r = await client.put("/api/v1/khata/settings/bill-template", json={"layout": reordered})
    assert r.status_code == 200
    assert r.json()["layout"]["blocks"][0]["id"] == "totals"

    tenant_id = uuid.UUID(tokens["tenant_id"])
    async with get_session() as session:
        template = (
            await session.execute(
                select(BillTemplate).where(BillTemplate.tenant_id == tenant_id)
            )
        ).scalar_one()
        assert template.layout["blocks"][0]["id"] == "totals"


@pytest.mark.asyncio
async def test_layout_uniqueness_enforced_in_db(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    first = (await client.get(BASE)).json()[0]
    second = await _create_preset(client, "Second")

    # Direct DB write marking two rows as the invoice default must fail.
    async with get_session() as session:
        row = (
            await session.execute(
                select(BillLayout).where(BillLayout.id == uuid.UUID(second["id"]))
            )
        ).scalar_one()
        row.is_default_invoice = True
        try:
            await session.commit()
            unique_enforced = False
        except Exception:
            await session.rollback()
            unique_enforced = True
    assert unique_enforced, (
        "partial unique index on is_default_invoice should reject a second default"
    )

    # And the first preset is still the invoice default.
    layouts = (await client.get(BASE)).json()
    assert [p["id"] for p in layouts if p["is_default_invoice"]] == [first["id"]]


@pytest.mark.asyncio
async def test_legacy_snapshot_layout_key_is_ignored(client):
    """A `layout` key left inside an old snapshot must not drive rendering."""
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Papadum")
    customer = await _create_customer(client)
    order = await _create_order(client, product, customer)
    await _place_order(client, order["id"])
    await _deliver_order(order["id"])
    payment = await _pay(client, customer["id"], "20.00")

    # Baseline: the seeded Standard preset (customer block visible).
    standard = (await client.get(f"/api/v1/khata/receipts/{payment['id']}/pdf")).content
    standard_len = len(standard)

    # Default receipt layout with the customer block switched off.
    base = normalize_layout((await client.get(BASE)).json()[0]["layout"])
    no_customer = {
        "blocks": [
            b if b["id"] != "customer" else {**b, "enabled": {**b["enabled"], "receipt": False}}
            for b in base["blocks"]
        ]
    }
    alt = await _create_preset(client, "No customer", no_customer)
    await _switch_default(client, alt["id"], "receipt")

    without_customer = (
        await client.get(f"/api/v1/khata/receipts/{payment['id']}/pdf")
    ).content
    assert len(without_customer) != standard_len

    # Forge a legacy snapshot that carries the *old* (customer-visible) layout.
    async with get_session() as session:
        row = (
            await session.execute(
                select(LedgerEntry).where(LedgerEntry.id == uuid.UUID(payment["id"]))
            )
        ).scalar_one()
        snapshot = dict(row.receipt_snapshot or {})
        snapshot["layout"] = base
        row.receipt_snapshot = snapshot
        await session.commit()

    r = await client.get(f"/api/v1/khata/receipts/{payment['id']}")
    assert "layout" in r.json()["snapshot"], "legacy snapshot should still expose the key"

    rendered = (await client.get(f"/api/v1/khata/receipts/{payment['id']}/pdf")).content
    # Rendered with the current default, i.e. identical content to the
    # customer-hidden render — not to the legacy layout embedded in the snapshot.
    assert len(rendered) == len(without_customer)
    assert len(rendered) != standard_len
