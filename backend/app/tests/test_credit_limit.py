import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.database import get_session
from app.core.security import create_access_token
from app.modules.customers.credit import (
    credit_available,
    credit_utilization,
    exceeds_limit,
)
from app.modules.orders.models import Order
from app.modules.products.models import InventoryMovement
from app.tests.test_khata import (
    _create_customer,
    _create_order,
    _create_product,
    _create_role_user,
    _deliver_order,
    _pay,
    _register,
)


async def _tenant(client):
    """Register a fresh tenant and leave its owner authenticated on `client`."""
    return await _register(client, f"t{uuid.uuid4().hex[:6]}")


async def _order_payload(customer_id, product, quantity="2.00"):
    return {
        "customer_id": customer_id,
        "delivery_address": "1 Test St",
        "items": [
            {
                "product_id": product["id"],
                "variant_id": product["variants"][0]["id"],
                "quantity": quantity,
            }
        ],
    }


# ---- unit: the pure math ------------------------------------------------------


def test_credit_helpers_treat_no_limit_as_unlimited():
    assert credit_available(None, 500) is None
    assert credit_utilization(None, 500) is None
    assert exceeds_limit(None, 500, 10_000) is False


def test_credit_helpers_compute_available_and_percent():
    assert credit_available(Decimal(1000), Decimal(250)) == Decimal("750.00")
    assert credit_utilization(Decimal(1000), Decimal(250)) == 25
    assert credit_utilization(Decimal(1000), Decimal(1500)) == 150


def test_credit_available_never_goes_negative_and_used_never_does():
    assert credit_available(Decimal(100), Decimal(250)) == Decimal("0.00")
    # An overpaid customer has used nothing of their limit.
    assert credit_utilization(Decimal(100), Decimal(-40)) == 0
    assert exceeds_limit(Decimal(100), Decimal(150), Decimal(1)) is True


def test_exceeds_limit_is_boundary_exact():
    # Landing exactly on the limit is allowed; a single paisa more is not.
    assert exceeds_limit(Decimal(100), Decimal(60), Decimal(40)) is False
    assert exceeds_limit(Decimal(100), Decimal(60), Decimal("40.01")) is True


# ---- integration: customers CRUD ---------------------------------------------


async def test_credit_limit_is_optional_and_defaults_to_unlimited(client):
    await _tenant(client)
    r = await client.post("/api/v1/customers", json={"name": "No Limit Co"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["credit_limit"] is None
    assert body["credit_used"] == "0.00"
    assert body["credit_available"] is None
    assert body["credit_utilization"] is None


async def test_create_customer_with_credit_limit(client):
    await _tenant(client)
    r = await client.post(
        "/api/v1/customers", json={"name": "Limited Co", "credit_limit": "5000.00"}
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["credit_limit"] == "5000.00"
    assert body["credit_available"] == "5000.00"
    assert body["credit_utilization"] == "0"


async def test_patch_can_set_and_clear_credit_limit(client):
    await _tenant(client)
    customer = await _create_customer(client, "Adjustable")
    r = await client.patch(
        f"/api/v1/customers/{customer['id']}", json={"credit_limit": "2500.50"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["credit_limit"] == "2500.50"
    # Explicit null clears it back to unlimited.
    r = await client.patch(
        f"/api/v1/customers/{customer['id']}", json={"credit_limit": None}
    )
    assert r.status_code == 200, r.text
    assert r.json()["credit_limit"] is None
    assert r.json()["credit_available"] is None


async def test_credit_limit_rejects_negative_and_bad_precision(client):
    await _tenant(client)
    r = await client.post(
        "/api/v1/customers", json={"name": "Bad Limit", "credit_limit": "-100"}
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/v1/customers", json={"name": "Bad Limit", "credit_limit": "1.234"}
    )
    assert r.status_code == 422


async def test_customer_list_carries_credit_figures(client):
    await _tenant(client)
    product = await _create_product(client, "Listed")
    customer = await _create_customer(client, "Listed Co", credit_limit="1000.00")
    order = await _create_order(client, product, customer)
    await _deliver_order(order["id"])

    r = await client.get("/api/v1/customers")
    assert r.status_code == 200
    row = next(c for c in r.json() if c["id"] == customer["id"])
    assert row["credit_limit"] == "1000.00"
    assert row["credit_used"] == "20.00"
    assert row["credit_available"] == "980.00"
    assert row["credit_utilization"] == "2"


async def test_csv_import_accepts_credit_limit(client):
    await _tenant(client)
    csv_body = (
        "name*,email,credit_limit\n"
        "Csv Limited,csv-limited@example.com,750.00\n"
        "Csv Blank,csv-blank@example.com,\n"
    )
    r = await client.post(
        "/api/v1/customers/import",
        files={"file": ("customers.csv", csv_body.encode(), "text/csv")},
    )
    assert r.status_code == 201, r.text
    assert r.json()["created"] == 2
    assert r.json()["failed"] == 0

    r = await client.get("/api/v1/customers?limit=200")
    rows = {c["name"]: c for c in r.json()}
    assert rows["Csv Limited"]["credit_limit"] == "750.00"
    assert rows["Csv Blank"]["credit_limit"] is None


async def test_csv_import_reports_bad_credit_limit_per_row(client):
    await _tenant(client)
    csv_body = "name*,credit_limit\nGood,100.00\nBad,not-a-number\n"
    r = await client.post(
        "/api/v1/customers/import",
        files={"file": ("customers.csv", csv_body.encode(), "text/csv")},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["created"] == 1
    assert body["failed"] == 1
    assert "credit_limit" in body["errors"][0]["message"]


# ---- integration: how usage is derived ---------------------------------------


async def test_credit_used_counts_open_orders_before_delivery(client):
    """Usage moves as soon as an order is placed, not only once delivered."""
    await _tenant(client)
    product = await _create_product(client, "Open")
    customer = await _create_customer(client, "Open Co", credit_limit="100.00")
    await _create_order(client, product, customer)

    r = await client.get(f"/api/v1/customers/{customer['id']}")
    assert r.json()["credit_used"] == "20.00"
    assert r.json()["credit_available"] == "80.00"
    assert r.json()["credit_utilization"] == "20"


async def test_payments_free_up_credit_again(client):
    await _tenant(client)
    product = await _create_product(client, "Paid")
    customer = await _create_customer(client, "Paid Co", credit_limit="100.00")
    order = await _create_order(client, product, customer)
    await _deliver_order(order["id"])
    await _pay(client, customer["id"], "20.00")

    r = await client.get(f"/api/v1/customers/{customer['id']}")
    assert r.json()["credit_used"] == "0.00"
    assert r.json()["credit_available"] == "100.00"


@pytest.mark.parametrize("dead_status", ["cancelled", "failed"])
async def test_dead_orders_do_not_consume_credit(client, dead_status):
    await _tenant(client)
    product = await _create_product(client, "Dead")
    customer = await _create_customer(client, "Dead Co", credit_limit="100.00")
    kept = await _create_order(client, product, customer)
    dead = await _create_order(client, product, customer)
    await _deliver_order(kept["id"])
    await _deliver_order(dead["id"])

    async with get_session() as session:
        row = (
            await session.execute(
                select(Order).where(Order.id == uuid.UUID(dead["id"]))
            )
        ).scalar_one()
        row.status = dead_status
        await session.commit()

    r = await client.get(f"/api/v1/customers/{customer['id']}")
    assert r.json()["credit_used"] == "20.00"


async def test_voided_payment_still_counts_against_credit(client):
    """Only active payments free credit; a voided one is not a refund."""
    await _tenant(client)
    product = await _create_product(client, "Voided")
    customer = await _create_customer(client, "Voided Co", credit_limit="100.00")
    order = await _create_order(client, product, customer)
    await _deliver_order(order["id"])
    payment = await _pay(client, customer["id"], "20.00")

    r = await client.post(
        f"/api/v1/khata/payments/{payment['id']}/void",
        json={"reason": "bounced"},
    )
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/v1/customers/{customer['id']}")
    assert r.json()["credit_used"] == "20.00"


async def test_overpaid_customer_uses_zero_credit(client):
    await _tenant(client)
    product = await _create_product(client, "Prepaid")
    customer = await _create_customer(client, "Prepaid Co", credit_limit="50.00")
    order = await _create_order(client, product, customer)
    await _deliver_order(order["id"])
    await _pay(client, customer["id"], "80.00")

    r = await client.get(f"/api/v1/customers/{customer['id']}")
    body = r.json()
    assert body["credit_used"] == "0.00"
    assert body["credit_available"] == "50.00"
    assert body["credit_utilization"] == "0"


# ---- integration: orders page gate --------------------------------------------


async def test_order_over_limit_is_rejected_then_allowed_with_override(client):
    await _tenant(client)
    product = await _create_product(client, "Gate")
    customer = await _create_customer(client, "Gate Co", credit_limit="50.00")
    # 6 x 10.00 = 60.00 against a 50.00 limit.
    payload = await _order_payload(customer["id"], product, "6.00")

    r = await client.post("/api/v1/orders", json=payload)
    assert r.status_code == 409, r.text
    assert "credit limit" in r.json()["detail"]

    r = await client.post(
        "/api/v1/orders", json={**payload, "override_credit_limit": True}
    )
    assert r.status_code == 201, r.text
    assert r.json()["total_amount"] == "60.00"


async def test_order_under_limit_needs_no_override(client):
    await _tenant(client)
    product = await _create_product(client, "Fine")
    customer = await _create_customer(client, "Fine Co", credit_limit="500.00")
    r = await client.post(
        "/api/v1/orders", json=await _order_payload(customer["id"], product)
    )
    assert r.status_code == 201, r.text


async def test_gate_uses_projected_total_not_order_total_alone(client):
    """Usage already committed counts toward the limit."""
    await _tenant(client)
    product = await _create_product(client, "Slide")
    customer = await _create_customer(client, "Slide Co", credit_limit="100.00")
    first = await _create_order(client, product, customer)  # 20.00
    await _deliver_order(first["id"])

    # 40.00 on top of 20.00 used -> 60.00 projected, still fine.
    r = await client.post(
        "/api/v1/orders", json=await _order_payload(customer["id"], product, "4.00")
    )
    assert r.status_code == 201, r.text
    # 30.00 on top of 60.00 -> 90.00 projected, still fine.
    r = await client.post(
        "/api/v1/orders", json=await _order_payload(customer["id"], product, "3.00")
    )
    assert r.status_code == 201, r.text
    # 40.00 on top of 90.00 -> 130.00 projected, blocked.
    r = await client.post(
        "/api/v1/orders", json=await _order_payload(customer["id"], product, "4.00")
    )
    assert r.status_code == 409, r.text


async def test_customers_without_a_limit_are_never_gated(client):
    await _tenant(client)
    product = await _create_product(client, "Unlimited")
    customer = await _create_customer(client, "Unlimited Co")
    r = await client.post(
        "/api/v1/orders",
        json=await _order_payload(customer["id"], product, "50.00"),
    )
    assert r.status_code == 201, r.text


async def test_payment_frees_room_for_the_next_order(client):
    """The gate re-reads usage, so settling up unblocks ordering again."""
    await _tenant(client)
    product = await _create_product(client, "Room")
    customer = await _create_customer(client, "Room Co", credit_limit="50.00")
    order = await _create_order(client, product, customer)  # 20.00
    await _deliver_order(order["id"])
    await _pay(client, customer["id"], "20.00")

    # 50.00 lands exactly on the 50.00 limit, which is allowed.
    r = await client.post(
        "/api/v1/orders", json=await _order_payload(customer["id"], product, "5.00")
    )
    assert r.status_code == 201, r.text


async def test_order_edit_that_tips_over_limit_needs_override(client):
    await _tenant(client)
    product = await _create_product(client, "Edit")
    customer = await _create_customer(client, "Edit Co", credit_limit="100.00")
    order = await _create_order(client, product, customer)  # 20.00
    await _deliver_order(order["id"])

    # Growing to 120.00 exceeds the 100.00 limit.
    payload = {
        "items": [
            {
                "product_id": product["id"],
                "variant_id": product["variants"][0]["id"],
                "quantity": "12.00",
            }
        ]
    }
    r = await client.patch(f"/api/v1/orders/{order['id']}", json=payload)
    assert r.status_code == 409, r.text
    assert "credit limit" in r.json()["detail"]

    r = await client.patch(
        f"/api/v1/orders/{order['id']}",
        json={**payload, "override_credit_limit": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["total_amount"] == "120.00"


async def test_order_edit_under_limit_still_works_without_override(client):
    await _tenant(client)
    product = await _create_product(client, "Edit Ok")
    customer = await _create_customer(client, "Edit Ok Co", credit_limit="100.00")
    order = await _create_order(client, product, customer)
    await _deliver_order(order["id"])
    r = await client.patch(
        f"/api/v1/orders/{order['id']}",
        json={
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "5.00",
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["total_amount"] == "50.00"


async def test_switching_customer_is_rechecked_against_the_new_limit(client):
    await _tenant(client)
    product = await _create_product(client, "Switch")
    big = await _create_customer(client, "Big Co", credit_limit=None)
    tight = await _create_customer(client, "Tight Co", credit_limit="10.00")
    order = await _create_order(client, product, big)  # 20.00
    await _deliver_order(order["id"])

    # Same items, no items key at all — only the customer moves.
    r = await client.patch(
        f"/api/v1/orders/{order['id']}", json={"customer_id": tight["id"]}
    )
    assert r.status_code == 409, r.text
    assert "credit limit" in r.json()["detail"]

    r = await client.patch(
        f"/api/v1/orders/{order['id']}",
        json={"customer_id": tight["id"], "override_credit_limit": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["customer_id"] == tight["id"]


async def test_switching_to_an_unlimited_customer_is_never_gated(client):
    await _tenant(client)
    product = await _create_product(client, "Switch Free")
    from_limited = await _create_customer(client, "From Limited Co", credit_limit="100.00")
    free = await _create_customer(client, "To Free Co", credit_limit=None)
    order = await _create_order(client, product, from_limited)
    await _deliver_order(order["id"])

    # Moving to a customer with no limit can never breach a limit.
    r = await client.patch(
        f"/api/v1/orders/{order['id']}", json={"customer_id": free["id"]}
    )
    assert r.status_code == 200, r.text
    assert r.json()["customer_id"] == free["id"]


async def test_cancelling_an_over_limit_order_does_not_need_override(client):
    await _tenant(client)
    product = await _create_product(client, "Cancel")
    customer = await _create_customer(client, "Cancel Co", credit_limit="100.00")
    order = await _create_order(client, product, customer)
    # Left undelivered: 'delivered' cannot transition straight to 'cancelled'.
    r = await client.patch(
        f"/api/v1/orders/{order['id']}",
        json={
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "15.00",
                }
            ],
            "override_credit_limit": True,
        },
    )
    assert r.status_code == 200, r.text

    # Cancelling releases the exposure, so it must not trip the gate.
    r = await client.patch(
        f"/api/v1/orders/{order['id']}", json={"status": "cancelled"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"

    r = await client.get(f"/api/v1/customers/{customer['id']}")
    assert r.json()["credit_used"] == "0.00"


async def test_shrinking_an_over_limit_order_needs_no_override(client):
    """An order already past the limit can always be brought back down."""
    await _tenant(client)
    product = await _create_product(client, "Shrink")
    customer = await _create_customer(client, "Shrink Co", credit_limit="10.00")
    r = await client.post(
        "/api/v1/orders", json=await _order_payload(customer["id"], product, "9.00")
    )
    assert r.status_code == 409
    created = await client.post(
        "/api/v1/orders",
        json={
            **await _order_payload(customer["id"], product, "9.00"),
            "override_credit_limit": True,
        },
    )
    assert created.status_code == 201
    # Now edit it down to 10.00 without an override — it should be allowed.
    r = await client.patch(
        f"/api/v1/orders/{created.json()['id']}",
        json={
            "items": [
                {
                    "product_id": product["id"],
                    "variant_id": product["variants"][0]["id"],
                    "quantity": "1.00",
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["total_amount"] == "10.00"


async def test_rejected_order_leaves_no_stock_movement(client):
    """The gate fires before stock is touched, so nothing is reserved."""
    await _tenant(client)
    product = await _create_product(client, "NoLeak")
    customer = await _create_customer(client, "NoLeak Co", credit_limit="10.00")

    async def movement_count():
        async with get_session() as session:
            return len(
                (
                    await session.execute(
                        select(InventoryMovement).where(
                            InventoryMovement.product_id == uuid.UUID(product["id"])
                        )
                    )
                ).scalars().all()
            )

    before = await movement_count()
    r = await client.post(
        "/api/v1/orders", json=await _order_payload(customer["id"], product, "4.00")
    )
    assert r.status_code == 409
    assert await movement_count() == before


# ---- integration: khata surfaces ---------------------------------------------


async def test_khata_summary_exposes_credit_limit(client):
    await _tenant(client)
    product = await _create_product(client, "Khata")
    customer = await _create_customer(client, "Khata Co", credit_limit="500.00")
    order = await _create_order(client, product, customer)
    await _deliver_order(order["id"])

    r = await client.get("/api/v1/khata/customers")
    assert r.status_code == 200
    row = next(c for c in r.json() if c["customer_id"] == customer["id"])
    assert row["credit_limit"] == "500.00"
    assert row["credit_used"] == "20.00"
    assert row["credit_available"] == "480.00"
    assert row["credit_utilization"] == "4"


async def test_khata_detail_exposes_credit_limit(client):
    await _tenant(client)
    product = await _create_product(client, "Khata Detail")
    customer = await _create_customer(client, "Khata Detail Co", credit_limit="500.00")
    order = await _create_order(client, product, customer)
    await _deliver_order(order["id"])

    r = await client.get(f"/api/v1/khata/customers/{customer['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["credit_limit"] == "500.00"
    assert body["credit_used"] == "20.00"
    assert body["credit_available"] == "480.00"
    assert body["credit_utilization"] == "4"


async def test_khata_customer_without_limit_reports_null_credit(client):
    await _tenant(client)
    product = await _create_product(client, "Khata Free")
    customer = await _create_customer(client, "Khata Free Co")
    order = await _create_order(client, product, customer)
    await _deliver_order(order["id"])

    r = await client.get(f"/api/v1/khata/customers/{customer['id']}")
    body = r.json()
    assert body["credit_limit"] is None
    assert body["credit_used"] == "20.00"
    assert body["credit_available"] is None
    assert body["credit_utilization"] is None


# ---- integration: permissions & tenancy ---------------------------------------


async def test_credit_limit_is_tenant_scoped(client):
    await _tenant(client)
    mine = await _create_customer(client, "Mine", credit_limit="900.00")

    other = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    client.cookies["access_token"] = create_access_token(
        other["user_id"], other["tenant_id"]
    )

    r = await client.get("/api/v1/customers")
    assert r.status_code == 200
    assert all(c["id"] != mine["id"] for c in r.json())

    r = await client.get(f"/api/v1/customers/{mine['id']}")
    assert r.status_code == 404


async def test_credit_limit_edit_requires_permission(client):
    tokens = await _tenant(client)
    customer = await _create_customer(client, "Guarded", credit_limit="100.00")
    collector_id = await _create_role_user(
        tokens["tenant_id"], "collector", f"c{uuid.uuid4().hex[:6]}@test.com"
    )

    client.cookies["access_token"] = create_access_token(
        collector_id, tokens["tenant_id"]
    )
    r = await client.patch(
        f"/api/v1/customers/{customer['id']}", json={"credit_limit": "999.00"}
    )
    assert r.status_code == 403


@pytest.mark.parametrize("limit", ["0.00", "0"])
async def test_zero_limit_blocks_any_positive_order(client, limit):
    """A zero limit is a deliberate 'no credit' setting, not 'no limit'."""
    await _tenant(client)
    product = await _create_product(client, "Zero")
    customer = await _create_customer(client, "Zero Co", credit_limit=limit)
    r = await client.post(
        "/api/v1/orders", json=await _order_payload(customer["id"], product, "1.00")
    )
    assert r.status_code == 409, r.text