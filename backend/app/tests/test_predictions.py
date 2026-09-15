import uuid

import pytest

from app.core.security import create_access_token
from app.tests.test_orders import (
    _create_customer,
    _create_order,
    _create_product,
    _register,
)


async def _create_user(tenant_id, role):
    from app.core.database import get_session
    from app.core.security import get_password_hash
    from app.modules.users.models import User

    email = f"_{uuid.uuid4().hex[:8]}@test.com"
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


def _make_csv(rows: list[tuple[str, str]]) -> bytes:
    lines = ["order_date*,quantity*"]
    for date_, qty in rows:
        lines.append(f"{date_},{qty}")
    return "\n".join(lines).encode("utf-8")


async def _upload(
    client,
    content: bytes,
    customer_id,
    product_id,
    variant_id=None,
):
    data = {
        "customer_id": str(customer_id),
        "product_id": str(product_id),
    }
    if variant_id:
        data["variant_id"] = str(variant_id)
    return await client.post(
        "/api/v1/predictions/import",
        data=data,
        files={"file": ("history.csv", content, "text/csv")},
    )


@pytest.mark.asyncio
async def test_download_import_sample_csv(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    r = await client.get("/api/v1/predictions/import/sample")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    assert "order_date*,quantity*" in r.text


@pytest.mark.asyncio
async def test_import_csv_creates_history_and_drives_analysis(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Sauce")
    customer = await _create_customer(client, "Acme")

    csv_bytes = _make_csv(
        [
            ("2026-05-10", "10"),
            ("2026-06-10", "12"),
            ("2026-07-12", "14"),
        ],
    )
    r = await _upload(
        client,
        csv_bytes,
        customer["id"],
        product["id"],
        variant_id=product["variants"][0]["id"],
    )
    assert r.status_code == 201, r.text
    result = r.json()
    assert result["created"] == 3
    assert result["failed"] == 0

    r = await client.get("/api/v1/predictions/analysis")
    assert r.status_code == 200
    analysis = r.json()
    assert analysis["summary"]["customer_count"] == 1
    assert analysis["summary"]["product_pairs"] == 1
    cust = analysis["customers"][0]
    assert cust["customer_name"] == "Acme"
    assert cust["product_count"] == 1
    assert cust["order_count"] == 3
    assert cust["next_order_date"] is not None
    assert cust["interest_score"] >= 0

    r = await client.get(f"/api/v1/predictions/customers/{cust['customer_id']}")
    assert r.status_code == 200
    detail = r.json()
    assert len(detail["products"]) == 1
    product_pred = detail["products"][0]
    assert product_pred["order_count"] == 3
    assert product_pred["median_gap_days"] is not None
    assert product_pred["recommendation"] in {"call", "message", "wait"}


@pytest.mark.asyncio
async def test_import_csv_requires_existing_customer_and_product(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Sauce")
    customer = await _create_customer(client, "Acme")
    csv_bytes = _make_csv([("2026-05-10", "10")])

    r = await _upload(client, csv_bytes, str(uuid.uuid4()), product["id"])
    assert r.status_code == 404
    r = await _upload(client, csv_bytes, customer["id"], str(uuid.uuid4()))
    assert r.status_code == 404
    r = await _upload(
        client, csv_bytes, customer["id"], product["id"], variant_id=str(uuid.uuid4())
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_import_csv_reports_row_level_data_errors(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Sauce")
    customer = await _create_customer(client, "Acme")

    csv_bytes = (
        b"order_date*,quantity*\n"
        b"bad-date,10\n"
        b"2026-05-10,0\n"
        b",15\n"
        b"2026-05-10,abc\n"
    )
    r = await _upload(client, csv_bytes, customer["id"], product["id"])
    assert r.status_code == 201, r.text
    result = r.json()
    assert result["created"] == 0
    assert result["failed"] == 4
    messages = " ".join(e["message"].lower() for e in result["errors"])
    assert "order_date" in messages
    assert "positive" in messages


@pytest.mark.asyncio
async def test_live_orders_and_history_are_combined(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Sauce")
    customer = await _create_customer(client, "Acme")

    created = await _create_order(client, product, customer)
    # Draft orders are not real purchases yet — confirm before they count as
    # order history for predictions.
    r = await client.patch(f"/api/v1/orders/{created['id']}", json={"status": "confirmed"})
    assert r.status_code == 200, r.text

    csv_bytes = _make_csv([("2026-06-01", "8"), ("2026-07-01", "9")])
    r = await _upload(client, csv_bytes, customer["id"], product["id"])
    assert r.status_code == 201
    assert r.json()["created"] == 2

    r = await client.get("/api/v1/predictions/analysis")
    assert r.status_code == 200
    cust = r.json()["customers"][0]
    # live order (created today) + 2 csv rows on the same product
    assert cust["order_count"] >= 3
    assert cust["product_count"] == 1


@pytest.mark.asyncio
async def test_clear_history_and_permissions(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    product = await _create_product(client, "Sauce")
    customer = await _create_customer(client, "Acme")

    await _upload(
        client,
        _make_csv([("2026-06-01", "8")]),
        customer["id"],
        product["id"],
    )

    r = await client.delete("/api/v1/predictions/history")
    assert r.status_code == 204

    # analyst (worker) can view but not import
    user_id = await _create_user(tenant_id, "worker")
    client.cookies["access_token"] = create_access_token(user_id, tenant_id)
    r = await client.get("/api/v1/predictions/analysis")
    assert r.status_code == 200
    r = await client.delete("/api/v1/predictions/history")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_add_manual_history_drives_product_and_customer_aggregation(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Sauce")
    variant_id = product["variants"][0]["id"]
    customer = await _create_customer(client, "Acme")

    r = await client.post(
        "/api/v1/predictions/history",
        json={
            "customer_id": customer["id"],
            "product_id": product["id"],
            "variant_id": variant_id,
            "rows": [
                {"order_date": "2026-05-10", "quantity": "10"},
                {"order_date": "2026-06-10", "quantity": "12"},
                {"order_date": "2026-07-12", "quantity": "14"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    result = r.json()
    assert result["created"] == 3
    assert result["failed"] == 0

    r = await client.get("/api/v1/predictions/analysis")
    assert r.status_code == 200
    analysis = r.json()
    assert analysis["summary"]["customer_count"] == 1
    assert len(analysis["products"]) == 1
    prod = analysis["products"][0]
    assert prod["product_name"] == "Sauce"
    assert prod["customer_count"] == 1
    assert prod["order_count"] == 3
    assert prod["stock_status"] in {
        "on_track",
        "due_soon",
        "overdue",
        "insufficient_data",
    }
    assert analysis["customers"][0]["product_count"] == 1

    # product variant must match the product
    r = await client.post(
        "/api/v1/predictions/history",
        json={
            "customer_id": customer["id"],
            "product_id": product["id"],
            "variant_id": str(uuid.uuid4()),
            "rows": [{"order_date": "2026-05-10", "quantity": "5"}],
        },
    )
    assert r.status_code == 422

    # customer unknown to this tenant must be rejected
    r = await client.post(
        "/api/v1/predictions/history",
        json={
            "customer_id": str(uuid.uuid4()),
            "product_id": product["id"],
            "rows": [{"order_date": "2026-05-10", "quantity": "5"}],
        },
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_product_detail_and_estimated_revenue(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    product = await _create_product(client, "Sauce")
    variant_id = product["variants"][0]["id"]
    customer = await _create_customer(client, "Acme")

    await client.post(
        "/api/v1/predictions/history",
        json={
            "customer_id": customer["id"],
            "product_id": product["id"],
            "variant_id": variant_id,
            "rows": [
                {"order_date": "2026-05-10", "quantity": "10"},
                {"order_date": "2026-06-10", "quantity": "12"},
                {"order_date": "2026-07-12", "quantity": "14"},
            ],
        },
    )

    r = await client.get(f"/api/v1/predictions/products/{product['id']}")
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["product_name"] == "Sauce"
    assert detail["customer_count"] == 1
    assert detail["order_count"] == 3
    assert len(detail["customers"]) == 1
    customer_row = detail["customers"][0]
    assert customer_row["customer_name"] == "Acme"
    assert customer_row["variant_id"] == variant_id
    # estimated revenue = avg qty * order count * unit price (10.00)
    expected = round(customer_row["avg_quantity"] * detail["order_count"] * 10)
    assert detail["estimated_revenue"] == expected
    assert detail["estimated_revenue"] > 0

    r = await client.get(f"/api/v1/predictions/products/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_product_detail_zero_revenue_without_price(client):
    await _register(client, f"t{uuid.uuid4().hex[:6]}")
    res = await client.post(
        "/api/v1/products",
        json={
            "name": "Ghost",
            "variants": [
                {
                    "name": "Default",
                    "sku": f"GHOST-{uuid.uuid4().hex[:6]}",
                    "prices": [],
                }
            ],
        },
    )
    assert res.status_code == 201, res.text
    product = res.json()
    customer = await _create_customer(client, "Acme")

    r = await client.post(
        "/api/v1/predictions/history",
        json={
            "customer_id": customer["id"],
            "product_id": product["id"],
            "rows": [
                {"order_date": "2026-05-10", "quantity": "10"},
                {"order_date": "2026-06-10", "quantity": "12"},
            ],
        },
    )
    assert r.status_code == 201

    r = await client.get(f"/api/v1/predictions/products/{product['id']}")
    assert r.status_code == 200
    detail = r.json()
    assert detail["estimated_revenue"] == 0


@pytest.mark.asyncio
async def test_delete_single_manual_history_row_requires_import_permission(client):
    tokens = await _register(client, f"t{uuid.uuid4().hex[:6]}")
    tenant_id = tokens["tenant_id"]
    product = await _create_product(client, "Sauce")
    customer = await _create_customer(client, "Acme")

    r = await client.post(
        "/api/v1/predictions/history",
        json={
            "customer_id": customer["id"],
            "product_id": product["id"],
            "rows": [
                {"order_date": "2026-05-10", "quantity": "10"},
                {"order_date": "2026-06-10", "quantity": "12"},
            ],
        },
    )
    assert r.status_code == 201, r.text

    r = await client.get("/api/v1/predictions/history?limit=50&offset=0")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2

    r = await client.delete(f"/api/v1/predictions/history/{rows[0]['id']}")
    assert r.status_code == 204

    r = await client.get("/api/v1/predictions/history?limit=50&offset=0")
    assert len(r.json()) == 1

    # worker cannot add or delete history
    user_id = await _create_user(tenant_id, "worker")
    client.cookies["access_token"] = create_access_token(user_id, tenant_id)
    r = await client.post(
        "/api/v1/predictions/history",
        json={
            "customer_id": customer["id"],
            "product_id": product["id"],
            "rows": [{"order_date": "2026-07-01", "quantity": "5"}],
        },
    )
    assert r.status_code == 403