from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.customers.models import Customer
from app.modules.orders.models import Order
from app.modules.predictions.engine import (
    OrderEvent,
    ProductPrediction,
    predict_product,
    tenant_average_gap,
)
from app.modules.predictions.models import OrderHistory
from app.modules.predictions.parser import (
    build_sample_csv,
    parse_order_history_csv,
)
from app.modules.predictions.repository import OrderHistoryRepository
from app.modules.predictions.schemas import (
    AnalysisRead,
    AnalysisSummary,
    CustomerDetailRead,
    CustomerPredictionRead,
    HistoryCreate,
    ImportResult,
    ImportRowResult,
    OrderHistoryRead,
    PredictionProductRead,
    ProductAggregateRead,
    ProductCustomerRead,
    ProductDetailRead,
)
from app.modules.products.models import Product, ProductVariant, VariantPrice

EXCLUDED_ORDER_STATUSES = {"draft", "failed", "cancelled"}

STATUS_RANK = {"on_track": 0, "due_soon": 1, "overdue": 2, "insufficient_data": -1}
ACTION_RANK = {"wait": 0, "message": 1, "call": 2}


class PredictionService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = OrderHistoryRepository(session, tenant_id)

    # ------------------------------------------------------------------
    # Order history (CSV import + listing)
    # ------------------------------------------------------------------

    async def import_history(
        self,
        content: bytes,
        customer_id: UUID,
        product_id: UUID,
        variant_id: UUID | None = None,
    ) -> ImportResult:
        """Upload order-date/quantity rows for a picked customer + product."""
        from app.shared.exceptions import NotFoundError, ValidationError

        customer = (
            await self.session.execute(
                select(Customer).where(
                    Customer.tenant_id == self.tenant_id,
                    Customer.id == customer_id,
                )
            )
        ).scalar_one_or_none()
        if customer is None:
            raise NotFoundError("Customer not found in your database")

        product = (
            await self.session.execute(
                select(Product).where(
                    Product.tenant_id == self.tenant_id,
                    Product.id == product_id,
                )
            )
        ).scalar_one_or_none()
        if product is None:
            raise NotFoundError("Product not found in your catalog")

        resolved_variant_id: UUID | None = None
        if variant_id:
            variant = (
                await self.session.execute(
                    select(ProductVariant).where(
                        ProductVariant.tenant_id == self.tenant_id,
                        ProductVariant.id == variant_id,
                        ProductVariant.product_id == product_id,
                    )
                )
            ).scalar_one_or_none()
            if variant is None:
                raise ValidationError(
                    "Variant not found for the selected product"
                )
            resolved_variant_id = variant.id

        rows, fatal = parse_order_history_csv(content)
        if fatal:
            return ImportResult(
                created=0,
                failed=1,
                errors=[ImportRowResult(row=0, message=fatal)],
            )

        created = 0
        errors: list[ImportRowResult] = []
        for row in rows:
            data = row.data
            order_date_raw = data.get("order_date")
            qty_raw = data.get("quantity")
            try:
                if not order_date_raw:
                    raise ValueError("order_date is missing or unparseable")
                if not qty_raw:
                    raise ValueError(
                        "quantity is missing or must be a positive number"
                    )

                try:
                    order_date = datetime.fromisoformat(order_date_raw)
                    if order_date.tzinfo is None:
                        order_date = order_date.replace(tzinfo=UTC)
                except ValueError:
                    raise ValueError(
                        "order_date is missing or unparseable"
                    ) from None

                try:
                    quantity = Decimal(str(qty_raw))
                except (InvalidOperation, ValueError) as exc:
                    raise ValueError(
                        f"quantity must be a number, got '{qty_raw}'"
                    ) from exc
                if quantity <= 0:
                    raise ValueError(
                        f"quantity must be positive, got '{qty_raw}'"
                    )

                await self.repo.create(
                    customer_id=customer.id,
                    product_id=product.id,
                    variant_id=resolved_variant_id,
                    order_date=order_date,
                    quantity=quantity,
                    source="csv",
                )
                created += 1
            except (ValueError, InvalidOperation) as exc:
                errors.append(ImportRowResult(row=row.row_number, message=str(exc)))
            except Exception as exc:  # noqa: BLE001 - per-row isolation
                errors.append(
                    ImportRowResult(row=row.row_number, message=f"Failed: {exc}")
                )
        await self.session.commit()
        return ImportResult(created=created, failed=len(errors), errors=errors)

    async def add_history(self, create: HistoryCreate) -> ImportResult:
        """Append manually-entered order dates for a picked customer+product."""
        from app.shared.exceptions import NotFoundError, ValidationError

        customer = (
            await self.session.execute(
                select(Customer).where(
                    Customer.tenant_id == self.tenant_id,
                    Customer.id == create.customer_id,
                )
            )
        ).scalar_one_or_none()
        if customer is None:
            raise NotFoundError("Customer not found in your database")

        product = (
            await self.session.execute(
                select(Product).where(
                    Product.tenant_id == self.tenant_id,
                    Product.id == create.product_id,
                )
            )
        ).scalar_one_or_none()
        if product is None:
            raise NotFoundError("Product not found in your catalog")

        variant_id: UUID | None = None
        if create.variant_id:
            variant = (
                await self.session.execute(
                    select(ProductVariant).where(
                        ProductVariant.tenant_id == self.tenant_id,
                        ProductVariant.id == create.variant_id,
                        ProductVariant.product_id == create.product_id,
                    )
                )
            ).scalar_one_or_none()
            if variant is None:
                raise ValidationError(
                    "Variant not found for the selected product"
                )
            variant_id = variant.id

        errors: list[ImportRowResult] = []
        created = 0
        for row_number, item in enumerate(create.rows, start=1):
            try:
                await self.repo.create(
                    customer_id=customer.id,
                    product_id=product.id,
                    variant_id=variant_id,
                    order_date=datetime.combine(item.order_date, datetime.min.time(), UTC),
                    quantity=item.quantity,
                    source="manual",
                )
                created += 1
            except Exception as exc:  # noqa: BLE001 - per-row isolation
                errors.append(ImportRowResult(row=row_number, message=f"Failed: {exc}"))
        await self.session.commit()
        return ImportResult(created=created, failed=len(errors), errors=errors)

    async def delete_history_row(self, row_id: UUID) -> None:
        from app.shared.exceptions import NotFoundError

        row = await self.repo.get(row_id)
        if row is None:
            raise NotFoundError("History row not found")
        await self.repo.delete(row)
        await self.session.commit()

    async def list_history(self, limit: int, offset: int) -> list[OrderHistoryRead]:
        rows = await self.repo.list(limit, offset)
        return [self._history_read(row) for row in rows]

    def _history_read(self, row: OrderHistory) -> OrderHistoryRead:
        customer = row.customer
        product = row.product
        variant = row.variant
        return OrderHistoryRead(
            id=row.id,
            tenant_id=row.tenant_id,
            customer_id=row.customer_id,
            customer_name=getattr(customer, "name", None) if customer else None,
            customer_email=getattr(customer, "email", None) if customer else None,
            product_id=row.product_id,
            product_name=str(getattr(product, "name", None) if product else row.product_id),
            sku=getattr(product, "sku", None) if product else None,
            variant_id=row.variant_id,
            variant_name=getattr(variant, "name", None) if variant else None,
            order_date=row.order_date,
            quantity=row.quantity,
            source=row.source,
            created_at=row.created_at,
        )

    async def clear_history(self) -> int:
        removed = await self.repo.clear()
        await self.session.commit()
        return removed

    # ------------------------------------------------------------------
    # Prediction engine
    # ------------------------------------------------------------------

    async def _collect_events(self) -> dict[tuple[str, str], list[OrderEvent]]:
        """Merge live orders with CSV history into per (customer, product) events."""
        grouped: dict[tuple[str, str], list[OrderEvent]] = {}

        # Live orders with real line items.
        orders = (
            (
                await self.session.execute(
                    select(Order)
                    .options(selectinload(Order.items))
                    .where(Order.tenant_id == self.tenant_id)
                    .where(Order.customer_id.is_not(None))
                    .where(Order.status.not_in(EXCLUDED_ORDER_STATUSES))
                )
            )
            .scalars()
            .unique()
            .all()
        )
        for order in orders:
            for item in order.items:
                if item.product_id is None:
                    continue
                key = (
                    str(order.customer_id),
                    str(item.product_id),
                )
                grouped.setdefault(key, []).append(
                    OrderEvent(
                        product_id=str(item.product_id),
                        product_name=item.product_name,
                        order_date=order.created_at.date(),
                        quantity=float(item.quantity or 0),
                        variant_id=str(item.variant_id) if item.variant_id else None,
                        variant_name=item.variant_name,
                        sku=None,
                    )
                )

        # CSV history (products resolved by product_id).
        history_rows = (
            (
                await self.session.execute(
                    select(OrderHistory)
                    .options(
                        selectinload(OrderHistory.product),
                        selectinload(OrderHistory.variant),
                    )
                    .where(OrderHistory.tenant_id == self.tenant_id)
                )
            )
            .scalars()
            .all()
        )
        for row in history_rows:
            key = (str(row.customer_id), str(row.product_id))
            grouped.setdefault(key, []).append(
                OrderEvent(
                    product_id=str(row.product_id),
                    product_name=str(row.product.name if row.product else row.product_id),
                    order_date=row.order_date.date(),
                    quantity=float(row.quantity or 0),
                    variant_id=str(row.variant_id) if row.variant_id else None,
                    variant_name=row.variant.name if row.variant else None,
                    sku=row.product.sku if row.product else None,
                )
            )

        # Merge events by (customer, product, date) so two line items on the
        # same day collapse into a single order event, then sort ascending.
        from collections import defaultdict

        merged: dict[tuple[str, str], dict[date, dict]] = defaultdict(dict)
        for key, events in grouped.items():
            for e in events:
                bucket = merged[key].setdefault(
                    e.order_date,
                    {
                        "quantity": 0.0,
                        "product_name": e.product_name,
                        "sku": e.sku,
                        "variant_id": e.variant_id,
                        "variant_name": e.variant_name,
                    },
                )
                bucket["quantity"] += e.quantity

        result: dict[tuple[str, str], list[OrderEvent]] = {}
        for key, by_date in merged.items():
            events = [
                OrderEvent(
                    product_id=key[1],
                    product_name=meta["product_name"],
                    order_date=d,
                    quantity=meta["quantity"],
                    sku=meta["sku"],
                    variant_id=meta["variant_id"],
                    variant_name=meta["variant_name"],
                )
                for d, meta in sorted(by_date.items())
            ]
            result[key] = events
        return result

    async def _customer_map(self) -> dict[str, Customer]:
        customers = (
            await self.session.execute(
                select(Customer).where(Customer.tenant_id == self.tenant_id)
            )
        ).scalars().all()
        return {str(c.id): c for c in customers}

    async def _price_lookup(self) -> tuple[dict[str, Decimal], dict[str, Decimal]]:
        """Current unit price per variant, plus a product-level fallback.

        Uses the active price entry whose effective window covers today (or has
        no window), favouring the most recent ``effective_from``. The product
        map is the first priced variant, so product-level pairs still get an
        estimate when the order didn't record a variant.
        """
        now = datetime.now(UTC)
        rows = (
            await self.session.execute(
                select(VariantPrice, ProductVariant.product_id)
                .join(ProductVariant, ProductVariant.id == VariantPrice.variant_id)
                .where(ProductVariant.tenant_id == self.tenant_id)
                .where(VariantPrice.is_active.is_(True))
                .where(
                    (VariantPrice.effective_from.is_(None))
                    | (VariantPrice.effective_from <= now)
                )
                .where(
                    (VariantPrice.effective_to.is_(None))
                    | (VariantPrice.effective_to >= now)
                )
                .order_by(
                    VariantPrice.effective_from.desc().nullslast(),
                    VariantPrice.created_at.desc(),
                )
            )
        ).all()

        price_by_variant: dict[str, Decimal] = {}
        price_by_product: dict[str, Decimal] = {}
        for price, product_id in rows:
            price_by_variant.setdefault(str(price.variant_id), price.price)
            price_by_product.setdefault(str(product_id), price.price)
        return price_by_variant, price_by_product

    async def _compute_products(
        self, events_by_pair: dict[tuple[str, str], list[OrderEvent]], today: date
    ) -> dict[tuple[str, str], ProductPrediction]:
        tenant_gap = tenant_average_gap(events_by_pair)
        return {
            pair: predict_product(events, today, tenant_gap)
            for pair, events in events_by_pair.items()
        }

    def _aggregate_customer(
        self,
        customer: Customer,
        predictions: list[ProductPrediction],
    ) -> CustomerPredictionRead:
        order_count = sum(p.order_count for p in predictions)
        product_count = len(predictions)

        valid_next = [p.next_order_date for p in predictions if p.next_order_date]
        next_order_date = min(valid_next) if valid_next else None

        days_until_next = None
        if next_order_date:
            days_until_next = (next_order_date - date.today()).days

        # Quantity-weighted average interest.
        total_qty = sum(p.avg_quantity for p in predictions)
        if total_qty > 0:
            interest = round(
                sum(p.interest_score * p.avg_quantity for p in predictions) / total_qty
            )
        else:
            interest = (
                round(sum(p.interest_score for p in predictions) / len(predictions))
                if predictions
                else 0
            )

        stock_status = max(
            (p.stock_status for p in predictions),
            key=lambda s: STATUS_RANK.get(s, -1),
            default="insufficient_data",
        )
        recommendation = max(
            (p.recommendation for p in predictions),
            key=lambda r: ACTION_RANK.get(r, 0),
            default="wait",
        )

        last_order_date = max(
            (p.last_order_date for p in predictions if p.last_order_date), default=None
        )

        return CustomerPredictionRead(
            customer_id=customer.id,
            customer_name=customer.name,
            customer_email=customer.email,
            customer_phone=customer.phone,
            order_count=order_count,
            product_count=product_count,
            last_order_date=last_order_date,
            next_order_date=next_order_date,
            days_until_next=days_until_next,
            interest_score=interest,
            stock_status=stock_status,
            recommendation=recommendation,
            products=[self._product_read(p) for p in predictions],
        )

    def _product_read(self, p: ProductPrediction) -> PredictionProductRead:
        return PredictionProductRead(
            product_id=UUID(p.product_id),
            product_name=p.product_name,
            sku=p.sku,
            variant_id=UUID(p.variant_id) if p.variant_id else None,
            variant_name=p.variant_name,
            order_count=p.order_count,
            last_order_date=p.last_order_date,
            avg_gap_days=round(p.avg_gap_days, 2) if p.avg_gap_days else None,
            median_gap_days=(
                round(p.median_gap_days, 2) if p.median_gap_days else None
            ),
            next_order_date=p.next_order_date,
            days_until_next=p.days_until_next,
            interest_score=p.interest_score,
            avg_quantity=p.avg_quantity,
            quantity_trend=p.quantity_trend,
            stock_status=p.stock_status,
            days_of_stock=p.days_of_stock,
            confidence=p.confidence,
            recommendation=p.recommendation,
        )

    def _aggregate_products(
        self,
        predictions: dict[tuple[str, str], ProductPrediction],
        price_by_variant: dict[str, Decimal] | None = None,
        price_by_product: dict[str, Decimal] | None = None,
    ) -> list[ProductAggregateRead]:
        """Group per-(customer, product) predictions into per-product rows."""
        by_product: dict[str, list[tuple[str, ProductPrediction]]] = {}
        for (customer_id, product_id), pred in predictions.items():
            by_product.setdefault(product_id, []).append((customer_id, pred))

        def pair_price(pred: ProductPrediction) -> Decimal | None:
            if pred.variant_id and price_by_variant:
                price = price_by_variant.get(pred.variant_id)
                if price is not None:
                    return price
            if pred.product_id and price_by_product:
                return price_by_product.get(pred.product_id)
            return None

        def pair_revenue(pred: ProductPrediction) -> float:
            price = pair_price(pred)
            if price is None or price <= 0:
                return 0.0
            return pred.avg_quantity * pred.order_count * float(price)

        rows: list[ProductAggregateRead] = []
        for product_id, entries in by_product.items():
            preds = [p for _, p in entries]
            customer_count = len({cid for cid, _ in entries})

            valid_next = [p.next_order_date for p in preds if p.next_order_date]
            next_order_date = min(valid_next) if valid_next else None
            days_until_next = (
                (next_order_date - date.today()).days if next_order_date else None
            )
            last_order_date = max(
                (p.last_order_date for p in preds if p.last_order_date), default=None
            )

            total_qty = sum(p.avg_quantity for p in preds)
            interest = (
                round(sum(p.interest_score * p.avg_quantity for p in preds) / total_qty)
                if total_qty > 0
                else (
                    round(sum(p.interest_score for p in preds) / len(preds))
                    if preds
                    else 0
                )
            )

            first = preds[0]
            stock_status = max(
                (p.stock_status for p in preds),
                key=lambda s: STATUS_RANK.get(s, -1),
                default="insufficient_data",
            )
            recommendation = max(
                (p.recommendation for p in preds),
                key=lambda r: ACTION_RANK.get(r, 0),
                default="wait",
            )

            rows.append(
                ProductAggregateRead(
                    product_id=UUID(product_id),
                    product_name=first.product_name,
                    sku=first.sku,
                    variant_id=UUID(first.variant_id) if first.variant_id else None,
                    variant_name=first.variant_name,
                    customer_count=customer_count,
                    order_count=sum(p.order_count for p in preds),
                    last_order_date=last_order_date,
                    next_order_date=next_order_date,
                    days_until_next=days_until_next,
                    avg_quantity=(
                        round(sum(p.avg_quantity for p in preds) / len(preds), 2)
                        if preds
                        else 0.0
                    ),
                    interest_score=interest,
                    stock_status=stock_status,
                    recommendation=recommendation,
                    overdue_count=sum(1 for p in preds if p.stock_status == "overdue"),
                    due_soon_count=sum(1 for p in preds if p.stock_status == "due_soon"),
                    on_track_count=sum(1 for p in preds if p.stock_status == "on_track"),
                    insufficient_count=sum(
                        1 for p in preds if p.stock_status == "insufficient_data"
                    ),
                    estimated_revenue=round(sum(pair_revenue(p) for p in preds)),
                )
            )

        rows.sort(
            key=lambda r: (
                STATUS_RANK.get(r.stock_status, -1),
                r.days_until_next if r.days_until_next is not None else 10**9,
            ),
            reverse=True,
        )
        return rows

    # ------------------------------------------------------------------
    # Analysis endpoints
    # ------------------------------------------------------------------

    async def analysis(self) -> AnalysisRead:
        today = date.today()
        events_by_pair = await self._collect_events()
        predictions = await self._compute_products(events_by_pair, today)
        customers = await self._customer_map()
        price_by_variant, price_by_product = await self._price_lookup()

        grouped: dict[str, list[ProductPrediction]] = {}
        for (customer_id, _product_id), pred in predictions.items():
            grouped.setdefault(customer_id, []).append(pred)

        customer_list: list[CustomerPredictionRead] = []
        for customer_id, preds in grouped.items():
            customer = customers.get(customer_id)
            if customer is None:
                continue
            customer_list.append(self._aggregate_customer(customer, preds))

        customer_list.sort(
            key=lambda c: (
                STATUS_RANK.get(c.stock_status, -1),
                c.days_until_next if c.days_until_next is not None else 10**9,
            ),
            reverse=True,
        )

        overdue = sum(1 for c in customer_list if c.stock_status == "overdue")
        due_soon = sum(1 for c in customer_list if c.stock_status == "due_soon")
        on_track = sum(1 for c in customer_list if c.stock_status == "on_track")
        insufficient = sum(
            1 for c in customer_list if c.stock_status == "insufficient_data"
        )
        avg_interest = (
            round(sum(c.interest_score for c in customer_list) / len(customer_list))
            if customer_list
            else 0
        )
        next_7_days = sum(
            1
            for c in customer_list
            if c.next_order_date and c.days_until_next is not None and 0 <= c.days_until_next <= 7
        )
        next_30_days = sum(
            1
            for c in customer_list
            if c.next_order_date and c.days_until_next is not None and 0 <= c.days_until_next <= 30
        )

        summary = AnalysisSummary(
            customer_count=len(customer_list),
            product_pairs=len(predictions),
            overdue_count=overdue,
            due_soon_count=due_soon,
            on_track_count=on_track,
            insufficient_data_count=insufficient,
            avg_interest=avg_interest,
            next_7_days=next_7_days,
            next_30_days=next_30_days,
        )

        tenant_gap = tenant_average_gap(events_by_pair)
        return AnalysisRead(
            generated_at=datetime.now(UTC),
            tenant_avg_gap_days=round(tenant_gap, 2) if tenant_gap else None,
            summary=summary,
            customers=customer_list,
            products=self._aggregate_products(
                predictions, price_by_variant, price_by_product
            ),
        )

    async def product_detail(self, product_id: UUID) -> ProductDetailRead:
        today = date.today()
        events_by_pair = await self._collect_events()
        predictions = await self._compute_products(events_by_pair, today)

        product = (
            await self.session.execute(
                select(Product).where(
                    Product.tenant_id == self.tenant_id,
                    Product.id == product_id,
                )
            )
        ).scalar_one_or_none()
        if product is None:
            from app.shared.exceptions import NotFoundError

            raise NotFoundError("Product not found")

        pairs = {
            pair: pred
            for pair, pred in predictions.items()
            if pair[1] == str(product_id)
        }

        price_by_variant, price_by_product = await self._price_lookup()
        rows = self._aggregate_products(pairs, price_by_variant, price_by_product)
        row = rows[0] if rows else None

        customers = await self._customer_map()
        entries: list[ProductCustomerRead] = []
        for (customer_id, _pid), pred in pairs.items():
            customer = customers.get(customer_id)
            entries.append(
                ProductCustomerRead(
                    customer_id=UUID(customer_id),
                    customer_name=customer.name if customer else customer_id,
                    customer_email=customer.email if customer else None,
                    customer_phone=customer.phone if customer else None,
                    product_id=UUID(pred.product_id),
                    product_name=pred.product_name,
                    sku=pred.sku,
                    variant_id=UUID(pred.variant_id) if pred.variant_id else None,
                    variant_name=pred.variant_name,
                    order_count=pred.order_count,
                    last_order_date=pred.last_order_date,
                    avg_gap_days=round(pred.avg_gap_days, 2) if pred.avg_gap_days else None,
                    median_gap_days=(
                        round(pred.median_gap_days, 2) if pred.median_gap_days else None
                    ),
                    next_order_date=pred.next_order_date,
                    days_until_next=pred.days_until_next,
                    interest_score=pred.interest_score,
                    avg_quantity=pred.avg_quantity,
                    quantity_trend=pred.quantity_trend,
                    stock_status=pred.stock_status,
                    days_of_stock=pred.days_of_stock,
                    confidence=pred.confidence,
                    recommendation=pred.recommendation,
                )
            )
        entries.sort(
            key=lambda e: (
                STATUS_RANK.get(e.stock_status, -1),
                e.days_until_next if e.days_until_next is not None else 10**9,
            ),
            reverse=True,
        )

        return ProductDetailRead(
            generated_at=datetime.now(UTC),
            product_id=product.id,
            product_name=row.product_name if row else product.name,
            sku=row.sku if row else product.sku,
            customer_count=row.customer_count if row else 0,
            order_count=row.order_count if row else 0,
            last_order_date=row.last_order_date if row else None,
            next_order_date=row.next_order_date if row else None,
            days_until_next=row.days_until_next if row else None,
            avg_quantity=row.avg_quantity if row else 0.0,
            interest_score=row.interest_score if row else 0,
            stock_status=row.stock_status if row else "insufficient_data",
            recommendation=row.recommendation if row else "wait",
            overdue_count=row.overdue_count if row else 0,
            due_soon_count=row.due_soon_count if row else 0,
            on_track_count=row.on_track_count if row else 0,
            insufficient_count=row.insufficient_count if row else 0,
            estimated_revenue=row.estimated_revenue if row else 0,
            customers=entries,
        )

    async def customer_detail(self, customer_id: UUID) -> CustomerDetailRead:
        today = date.today()
        events_by_pair = await self._collect_events()
        predictions = await self._compute_products(events_by_pair, today)

        customer = (
            await self.session.execute(
                select(Customer).where(
                    Customer.tenant_id == self.tenant_id,
                    Customer.id == customer_id,
                )
            )
        ).scalar_one_or_none()
        if customer is None:
            from app.shared.exceptions import NotFoundError

            raise NotFoundError("Customer not found")

        preds = [
            pred
            for (cid, _pid), pred in predictions.items()
            if cid == str(customer_id)
        ]
        agg = self._aggregate_customer(customer, preds)
        return CustomerDetailRead(
            generated_at=datetime.now(UTC),
            customer_id=customer.id,
            customer_name=customer.name,
            customer_email=customer.email,
            customer_phone=customer.phone,
            order_count=agg.order_count,
            product_count=agg.product_count,
            last_order_date=agg.last_order_date,
            next_order_date=agg.next_order_date,
            days_until_next=agg.days_until_next,
            interest_score=agg.interest_score,
            stock_status=agg.stock_status,
            recommendation=agg.recommendation,
            products=agg.products,
        )

    def sample_csv(self) -> str:
        return build_sample_csv()