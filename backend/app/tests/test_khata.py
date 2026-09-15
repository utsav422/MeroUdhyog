import asyncio
import uuid

import pytest

from app.core.security import create_access_token


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


async def _create_product(client, name):
    r = await client.post(
        "/api/v1/products",
        json={
            "name": name,
            "variants": [
                {
                    "name": "Default",
                    "sku": f"VAR-{name}",
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


async def _create_order(client, product, customer=None):
    payload = {
        "customer_id": customer["id"] if customer else None,
        "delivery_address": "123 Main St",
        "items": [
            {
                "product_id": product["id"],
                "variant_id": product["variants"][0]["id"],
                "quantity": "2.00",
                "unit_price": "10.00",
            }
        ],
    }
    r = await client.post("/api/v1/orders", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


async def _place_order(client, order_id):
    r = await client.patch(f"/api/v1/orders/{order_id}", json={"status": "confirmed"})
    assert r.status_code == 200, r.text
    return r.json()


async def _pay(client, customer_id, amount, method="cash", allocations=None, generate_receipt=True):
    payload = {
        "customer_id": customer_id,
        "amount": amount,
        "method": method,
        "generate_receipt": generate_receipt,
    }
    if allocations is not None:
        payload["allocations"] = allocations
    r = await client.post("/api/v1/khata/payments", json=payload)
    response = r.json()
    assert r.status_code == 201, response
    return response


async def _setup_two_orders(client, product, customer):
    order_a = await _create_order(client, product, customer)
    await asyncio.sleep(0.02)
    order_b = await _create_order(client, product, customer)
    await _place_order(client, order_a["id"])
    await _place_order(client, order_b["id"])
    return order_a, order_b


def _customer_summary(customers, customer_id):
    return next(c for c in customers if c["customer_id"] == customer_id)


@pytest.mark.asyncio
async def test_collector_role_khata_access(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    collector_id = await _create_role_user(
        tenant_id, "collector", f"c{uuid.uuid4().hex[:6]}@test.com"
    )
    client.cookies["access_token"] = create_access_token(collector_id, tenant_id)

    r = await client.get("/api/v1/khata/customers")
    assert r.status_code == 200

    # A collector settles khata, but cannot manage the catalog.
    r = await client.post("/api/v1/orders", json={"items": []})
    assert r.status_code == 403

    # The bill format is Owner-only.
    r = await client.get("/api/v1/khata/settings/bill-template")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_bill_template_settings_owner_only(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")

    r = await client.get("/api/v1/khata/settings/bill-template")
    assert r.status_code == 200
    assert r.json()["invoice_number_prefix"] == "INV-"
    assert r.json()["next_invoice_number"] == 1

    r = await client.put(
        "/api/v1/khata/settings/bill-template",
        json={"business_name": "Acme Factory", "footer_note": "Thanks!"},
    )
    assert r.status_code == 200
    assert r.json()["business_name"] == "Acme Factory"


@pytest.mark.asyncio
async def test_bill_template_layout_defaults(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")

    r = await client.get("/api/v1/khata/settings/bill-template")
    assert r.status_code == 200
    blocks = r.json()["layout"]["blocks"]
    ids = [b["id"] for b in blocks]
    assert ids == [
        "branding",
        "document_meta",
        "customer",
        "order_status",
        "items",
        "totals",
        "notes",
        "footer_note",
        "signature",
    ]

    branding = blocks[0]
    assert branding["alignable"] is True
    assert branding["align"] == "left"
    assert branding["enabled"] == {"invoice": True, "receipt": True}

    totals = next(b for b in blocks if b["id"] == "totals")
    assert totals["align"] == "right"

    # order_status + signature only apply to invoices.
    for bid in ("order_status", "signature"):
        block = next(b for b in blocks if b["id"] == bid)
        assert block["applies"] == ["invoice"]
        assert block["enabled"] == {"invoice": True}

    assert blocks[3]["alignable"] is False


@pytest.mark.asyncio
async def test_bill_template_layout_reorder_and_persist(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")

    r = await client.get("/api/v1/khata/settings/bill-template")
    blocks = r.json()["layout"]["blocks"]

    # Move totals to the top, centre branding and disable customer on receipts.
    reordered = [b for b in blocks if b["id"] == "totals"] + [
        b for b in blocks if b["id"] != "totals"
    ]
    for block in reordered:
        if block["id"] == "branding":
            block["align"] = "center"
        if block["id"] == "customer":
            block["enabled"] = {
                "invoice": block["enabled"]["invoice"],
                "receipt": False,
            }

    r = await client.put(
        "/api/v1/khata/settings/bill-template",
        json={"layout": {"blocks": reordered}},
    )
    assert r.status_code == 200, r.text
    blocks = r.json()["layout"]["blocks"]
    assert blocks[0]["id"] == "totals"
    branding = next(b for b in blocks if b["id"] == "branding")
    assert branding["align"] == "center"
    customer = next(b for b in blocks if b["id"] == "customer")
    assert customer["enabled"] == {"invoice": True, "receipt": False}

    # The saved layout is frozen into issued PDFs and both still render.
    product = await _create_product(client, "Sauce")
    customer_row = await _create_customer(client)
    order, _ = await _setup_two_orders(client, product, customer_row)
    payment = await _pay(client, customer_row["id"], "20.00")

    r = await client.get(f"/api/v1/khata/receipts/{payment['id']}/pdf")
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")

    r = await client.get(f"/api/v1/khata/orders/{order['id']}/invoice/pdf")
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_bill_template_layout_invalid_block(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")

    r = await client.put(
        "/api/v1/khata/settings/bill-template",
        json={"layout": {"blocks": [{"id": "not_a_block"}]}},
    )
    assert r.status_code == 422

    r = await client.put(
        "/api/v1/khata/settings/bill-template",
        json={"layout": {"blocks": [{"id": "customer", "enabled": "nope"}]}},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_fifo_splits_oldest_order_first(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Sauce")
    customer = await _create_customer(client)
    order_a, order_b = await _setup_two_orders(client, product, customer)

    payment = await _pay(client, customer["id"], "25.00")
    allocs = {a["order_ref"]: a["amount_applied"] for a in payment["allocations"]}
    assert allocs[order_a["order_ref"]] == "20.00"
    assert allocs[order_b["order_ref"]] == "5.00"
    assert payment["receipt_number"] == "RCT-1"
    assert payment["status"] == "active"

    r = await client.get(f"/api/v1/orders/{order_a['id']}")
    assert r.json()["payment_status"] == "paid"
    assert r.json()["amount_paid"] == "20.00"

    r = await client.get(f"/api/v1/orders/{order_b['id']}")
    assert r.json()["payment_status"] == "partial"
    assert r.json()["amount_paid"] == "5.00"

    r = await client.get("/api/v1/khata/customers")
    row = _customer_summary(r.json(), customer["id"])
    assert row["total_billed"] == "40.00"
    assert row["total_paid"] == "25.00"
    assert row["outstanding"] == "15.00"
    assert row["order_count"] == 2


@pytest.mark.asyncio
async def test_overpayment_runs_as_customer_credit(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Ketchup")
    customer = await _create_customer(client)
    order_a, order_b = await _setup_two_orders(client, product, customer)

    payment = await _pay(client, customer["id"], "60.00")
    allocs = {a["order_ref"]: a["amount_applied"] for a in payment["allocations"]}
    assert allocs[order_a["order_ref"]] == "20.00"
    assert allocs[order_b["order_ref"]] == "20.00"

    r = await client.get(f"/api/v1/khata/customers/{customer['id']}")
    detail = r.json()
    assert detail["outstanding"] == "-20.00"
    assert all(o["payment_status"] == "paid" for o in detail["orders"])


@pytest.mark.asyncio
async def test_manual_allocations_apply_to_chosen_order(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Mayo")
    customer = await _create_customer(client)
    order_a, order_b = await _setup_two_orders(client, product, customer)

    payment = await _pay(
        client,
        customer["id"],
        "15.00",
        method="esewa",
        allocations=[{"order_id": order_b["id"], "amount": "15.00"}],
    )
    assert len(payment["allocations"]) == 1
    assert payment["allocations"][0]["order_ref"] == order_b["order_ref"]

    r = await client.get(f"/api/v1/orders/{order_b['id']}")
    assert r.json()["payment_status"] == "partial"
    r = await client.get(f"/api/v1/orders/{order_a['id']}")
    assert r.json()["payment_status"] == "unpaid"

    # Allocations cannot exceed what a single order still owes.
    r = await client.post(
        "/api/v1/khata/payments",
        json={
            "customer_id": customer["id"],
            "amount": "25.00",
            "method": "cash",
            "allocations": [{"order_id": order_a["id"], "amount": "25.00"}],
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_void_payment_reverses_orders(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Vinegar")
    customer = await _create_customer(client)
    order, _ = await _setup_two_orders(client, product, customer)

    payment = await _pay(client, customer["id"], "20.00")
    r = await client.get(f"/api/v1/orders/{order['id']}")
    assert r.json()["payment_status"] == "paid"

    r = await client.post(
        f"/api/v1/khata/payments/{payment['id']}/void", json={"reason": "Wrong amount"}
    )
    assert r.status_code == 200
    assert r.json()["status"] == "voided"

    r = await client.get(f"/api/v1/orders/{order['id']}")
    assert r.json()["payment_status"] == "unpaid"
    assert r.json()["amount_paid"] == "0.00"

    r = await client.get("/api/v1/khata/customers")
    row = _customer_summary(r.json(), customer["id"])
    assert row["total_paid"] == "0.00"
    assert row["outstanding"] == "40.00"


@pytest.mark.asyncio
async def test_collector_cannot_void_payment(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    product = await _create_product(client, "Chilli")
    customer = await _create_customer(client)
    order, _ = await _setup_two_orders(client, product, customer)
    payment = await _pay(client, customer["id"], "20.00")

    collector_id = await _create_role_user(
        tenant_id, "collector", f"c{uuid.uuid4().hex[:6]}@test.com"
    )
    client.cookies["access_token"] = create_access_token(collector_id, tenant_id)

    r = await client.post(
        f"/api/v1/khata/payments/{payment['id']}/void", json={"reason": "nope"}
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_receipts_and_invoices_generate(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Pesto")
    customer = await _create_customer(client)
    order, _ = await _setup_two_orders(client, product, customer)

    payment = await _pay(client, customer["id"], "20.00")
    assert payment["receipt_number"] == "RCT-1"

    r = await client.get(f"/api/v1/khata/receipts/{payment['id']}")
    assert r.status_code == 200
    receipt = r.json()
    assert receipt["receipt_number"] == "RCT-1"
    assert receipt["status"] == "active"
    assert receipt["customer_name"] == customer["name"]

    r = await client.get(f"/api/v1/khata/receipts/{payment['id']}/pdf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")

    r = await client.get(f"/api/v1/khata/orders/{order['id']}/invoice")
    assert r.status_code == 200
    invoice = r.json()
    assert invoice["invoice_number"] == "INV-1"
    assert invoice["payment_status"] == "paid"
    assert len(invoice["items"]) == 1

    # Re-fetching the invoice is idempotent — same number.
    r = await client.get(f"/api/v1/khata/orders/{order['id']}/invoice")
    assert r.json()["invoice_number"] == "INV-1"

    r = await client.get(f"/api/v1/khata/orders/{order['id']}/invoice/pdf")
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_payment_requires_placed_order(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Guac")
    customer = await _create_customer(client)
    # Order stays in 'draft' — not billable until placed.
    await _create_order(client, product, customer)

    r = await client.post(
        "/api/v1/khata/payments",
        json={"customer_id": customer["id"], "amount": "10.00", "method": "cash"},
    )
    assert r.status_code == 422