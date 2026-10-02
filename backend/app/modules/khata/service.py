"""Khata service.

The core invariant (per the project brief): recording a payment, computing its
allocations and updating the affected orders' `payment_status`/`amount_paid`
happen inside ONE database transaction. `get_db` commits only when the request
suceeds, so a failure anywhere rolls everything back — the ledger and the order
statuses can never drift out of sync. Voiding reverses the same way.
"""

from __future__ import annotations

import base64
from datetime import UTC, date, datetime, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select, update

from app.modules.customers.credit import (
    credit_available,
    credit_used_for,
    credit_used_map,
    credit_utilization,
)
from app.modules.khata import pdf
from app.modules.khata.layout import default_layout, normalize_layout
from app.modules.khata.models import BillLayout, BillTemplate, LedgerEntry
from app.modules.khata.repository import KhataRepository
from app.modules.khata.schemas import (
    VALID_METHODS,
    BillLayoutPresetCreate,
    BillLayoutPresetRead,
    BillLayoutPresetUpdate,
    BillTemplateRead,
    BillTemplateUpdate,
    CustomerKhataDetail,
    ImageAsset,
    InvoiceItemRead,
    InvoiceRead,
    KhataCustomerSummary,
    KhataOrderRead,
    LedgerEntryRead,
    ManualAllocation,
    PaymentAllocationRead,
    PaymentListRead,
    PaymentRead,
    ReceiptRead,
    RecordPaymentInput,
    SetBillLayoutDefaultInput,
)
from app.modules.orders.models import Order
from app.modules.users.models import User
from app.shared.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError

ZERO = Decimal("0.00")
MAX_IMAGE_BYTES = 3 * 1024 * 1024
ALLOWED_IMAGE_MIMES = {"image/png", "image/jpeg", "image/gif", "image/webp"}


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


class KhataService:
    def __init__(self, session, tenant_id: UUID, user_id: UUID | None = None):
        self.session = session
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.repo = KhataRepository(session, tenant_id)

    # ---- reading ------------------------------------------------------------------

    async def list_customers(self) -> list[KhataCustomerSummary]:
        customers = await self.repo.list_customers()
        billed = await self.repo.billed_by_customer()
        paid = await self.repo.paid_by_customer()
        last = await self.repo.last_payment_by_customer()
        credit_used = await credit_used_map(self.session, self.tenant_id)

        rows: list[KhataCustomerSummary] = []
        for c in customers:
            billed_total, order_count = billed.get(c.id, (ZERO, 0))
            paid_total = paid.get(c.id, ZERO)
            last_date, last_amount = last.get(c.id, (None, None))
            used = credit_used.get(c.id, ZERO)
            rows.append(
                KhataCustomerSummary(
                    customer_id=c.id,
                    customer_name=c.name,
                    phone=c.phone,
                    company=c.company,
                    city=c.city,
                    total_billed=billed_total,
                    total_paid=paid_total,
                    outstanding=_q2(billed_total - paid_total),
                    order_count=order_count,
                    last_payment_date=last_date,
                    last_payment_amount=last_amount,
                    credit_limit=c.credit_limit,
                    credit_used=used,
                    credit_available=credit_available(c.credit_limit, used),
                    credit_utilization=credit_utilization(c.credit_limit, used),
                )
            )
        return rows

    async def customer_detail(self, customer_id: UUID) -> CustomerKhataDetail:
        customer = await self.repo.get_customer(customer_id)
        orders = await self.repo.list_billable_orders(customer_id)
        payments = await self.repo.list_payments(customer_id)
        invoice_numbers = await self.repo.invoice_numbers_by_order([o.id for o in orders])
        total_billed = sum(((o.total_amount or ZERO) for o in orders), ZERO)
        total_paid = sum((p.amount for p in payments if p.status == "active"), ZERO)

        order_reads = [
            KhataOrderRead(
                order_id=o.id,
                order_ref=o.order_ref,
                created_at=o.created_at,
                status=o.status,
                total_amount=o.total_amount,
                amount_paid=o.amount_paid,
                payment_status=o.payment_status,
            )
            for o in orders
        ]
        payment_reads = [self._payment_read(p) for p in payments]

        used = await credit_used_for(self.session, self.tenant_id, customer.id)
        return CustomerKhataDetail(
            customer_id=customer.id,
            customer_name=customer.name,
            phone=customer.phone,
            email=customer.email,
            company=customer.company,
            city=customer.city,
            address=customer.address,
            total_billed=_q2(total_billed),
            total_paid=_q2(total_paid),
            outstanding=_q2(total_billed - total_paid),
            credit_limit=customer.credit_limit,
            credit_used=used,
            credit_available=credit_available(customer.credit_limit, used),
            credit_utilization=credit_utilization(customer.credit_limit, used),
            orders=order_reads,
            payments=payment_reads,
            ledger=self._build_ledger(orders, payments, invoice_numbers),
        )

    def _build_ledger(
        self,
        orders: list[Order],
        payments: list[LedgerEntry],
        invoice_numbers: dict,
    ) -> list[LedgerEntryRead]:
        """Chronological debit/credit ledger for the customer's account.

        Billed orders appear as debit rows (the customer owes) and active
        payments as credit rows. Voided payments are excluded so the closing
        balance always reconciles with ``total_billed - total_paid``. The
        running balance is debtor (Dr) when positive and creditor (Cr) when
        negative — i.e. the customer paid ahead of their bills.
        """
        rows: list[dict] = []
        for o in orders:
            rows.append(
                {
                    "date": o.created_at,
                    "entry_type": "invoice",
                    "order_id": o.id,
                    "order_ref": o.order_ref,
                    "invoice_number": invoice_numbers.get(o.id),
                    "payment_id": None,
                    "receipt_number": None,
                    "payer_bill_no": None,
                    "debit": _q2(o.total_amount or ZERO),
                    "credit": None,
                }
            )
        for p in payments:
            if p.status != "active":
                continue
            rows.append(
                {
                    "date": p.collected_at,
                    "entry_type": "payment",
                    "order_id": None,
                    "order_ref": None,
                    "invoice_number": None,
                    "payment_id": p.id,
                    "receipt_number": p.receipt_number,
                    "payer_bill_no": p.payer_bill_no,
                    "debit": None,
                    "credit": _q2(p.amount),
                }
            )
        rows.sort(
            key=lambda r: (
                r["date"],
                0 if r["entry_type"] == "invoice" else 1,
                r["order_id"] or r["payment_id"] or "",
            )
        )
        running = ZERO
        ledger: list[LedgerEntryRead] = []
        for r in rows:
            debit = r["debit"] or ZERO
            credit = r["credit"] or ZERO
            running = _q2(running + debit - credit)
            side = "dr" if running > ZERO else "cr" if running < ZERO else "zero"
            ledger.append(
                LedgerEntryRead(
                    date=r["date"],
                    entry_type=r["entry_type"],
                    ref=r["order_ref"] or r["receipt_number"],
                    order_id=r["order_id"],
                    order_ref=r["order_ref"],
                    invoice_number=r["invoice_number"],
                    payment_id=r["payment_id"],
                    receipt_number=r["receipt_number"],
                    payer_bill_no=r["payer_bill_no"],
                    debit=r["debit"],
                    credit=r["credit"],
                    balance=running,
                    balance_side=side,
                )
            )
        return ledger

    def _payment_read(self, entry: LedgerEntry) -> PaymentRead:
        return PaymentRead(
            id=entry.id,
            customer_id=entry.customer_id,
            customer_name=entry.customer_name,
            amount=entry.amount,
            method=entry.method,
            collected_by=entry.collected_by,
            collector_name=entry.collector_name,
            collected_at=entry.collected_at,
            note=entry.note,
            payer_bill_no=entry.payer_bill_no,
            receipt_number=entry.receipt_number,
            status=entry.status,
            voided_at=entry.voided_at,
            void_reason=entry.void_reason,
            allocations=[
                PaymentAllocationRead(
                    order_id=a.order_id,
                    order_ref=a.order_ref,
                    amount_applied=a.amount_applied,
                )
                for a in (entry.allocations or [])
            ],
        )

    # ---- payment flow ----------------------------------------------------------------

    async def list_payments(
        self,
        limit: int,
        offset: int,
        *,
        customer_id: UUID | None = None,
        method: str | None = None,
        status: str | None = None,
        route_id: UUID | None = None,
        search: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> PaymentListRead:
        """Global, filterable, paginated payment history across all customers."""
        filters = {
            "customer_id": customer_id,
            "method": method,
            "status": status,
            "route_id": route_id,
            "search": search,
            # collected_at is tz-aware; date-only filters become full-day ranges.
            "date_from": (
                datetime.combine(date_from, time.min, tzinfo=UTC) if date_from else None
            ),
            "date_to": (
                datetime.combine(date_to, time.max, tzinfo=UTC) if date_to else None
            ),
        }
        entries = await self.repo.list_payments_filtered(limit, offset, **filters)
        total, total_amount = await self.repo.payment_totals(**filters)
        return PaymentListRead(
            items=[self._payment_read(e) for e in entries],
            total=total,
            total_amount=_q2(total_amount),
            limit=limit,
            offset=offset,
        )

    def _notify_service(self):
        from app.modules.notifications.service import NotificationService

        return NotificationService(self.session, self.tenant_id)

    async def _notify_payment(
        self, customer_id: UUID, amount: Decimal, allocations: list[tuple[Order, Decimal]]
    ) -> None:
        try:
            order_refs = [str(order.order_ref) for order, _amt in allocations if order.order_ref]
            await self._notify_service().payment_received(
                customer_id,
                f"₹{_q2(amount):.2f}",
                order_refs,
            )
        except Exception:  # noqa: BLE001 - never break a payment on notifications
            import logging

            logging.getLogger("factory.notifications").exception(
                "Failed to create payment notification"
            )

    async def record_payment(self, data: RecordPaymentInput) -> PaymentRead:
        await self.repo.get_customer(data.customer_id)  # tenant check + existence
        if data.amount <= 0:
            raise ValidationError("Amount must be greater than zero")
        if data.method not in VALID_METHODS:
            raise ValidationError(
                f"method must be one of: {', '.join(sorted(VALID_METHODS))}"
            )
        if data.note and len(data.note) > 500:
            raise ValidationError("Note is too long (max 500 characters)")
        collected_at = data.collected_at or datetime.now(UTC)

        orders = await self.repo.list_billable_orders(data.customer_id)
        if not orders:
            raise ValidationError(
                "This customer has no delivered orders to settle. "
                "Only delivered orders can receive payments."
            )

        allocations = self._allocate(orders, data)

        template = await self.repo.get_template_or_create()
        receipt_number: str | None = None
        if data.generate_receipt:
            receipt_number = f"{template.receipt_number_prefix}{template.next_receipt_number}"
            template.next_receipt_number += 1

        entry = LedgerEntry(
            tenant_id=self.tenant_id,
            customer_id=data.customer_id,
            amount=_q2(data.amount),
            method=data.method,
            collected_by=self.user_id,
            collected_at=collected_at,
            note=data.note,
            payer_bill_no=data.payer_bill_no,
            receipt_number=receipt_number,
            receipt_snapshot=template.snapshot() if data.generate_receipt else None,
            status="active",
        )
        self.session.add(entry)
        await self.session.flush()

        for order, amt in allocations:
            order.amount_paid = _q2((order.amount_paid or ZERO) + amt)
            self._recompute_payment_status(order)
            await self.repo.add_allocation(entry.id, order.id, amt)
        await self.session.flush()

        await self._notify_payment(data.customer_id, data.amount, allocations)

        # Rebuild with fully-loaded relationships for the response.
        fresh = await self.repo.get_entry(entry.id)
        return self._payment_read(fresh)

    def _allocate(
        self, orders: list[Order], data: RecordPaymentInput
    ) -> list[tuple[Order, Decimal]]:
        if data.allocations:
            return self._manual_allocate(orders, data.allocations, data.amount)
        # FIFO: oldest outstanding order first, until the amount is used up.
        result: list[tuple[Order, Decimal]] = []
        remaining = data.amount
        for order in orders:
            owed = (order.total_amount or ZERO) - (order.amount_paid or ZERO)
            if owed <= 0:
                continue
            take = min(remaining, owed)
            if take <= 0:
                continue
            result.append((order, _q2(take)))
            remaining -= take
            if remaining <= 0:
                break
        return result

    def _manual_allocate(
        self, orders: list[Order], allocations: list[ManualAllocation], payment_amount: Decimal
    ) -> list[tuple[Order, Decimal]]:
        order_map = {o.id: o for o in orders}
        seen: set[UUID] = set()
        total = ZERO
        result: list[tuple[Order, Decimal]] = []
        for man in allocations:
            if man.order_id in seen:
                raise ValidationError("Duplicate allocation for the same order")
            order = order_map.get(man.order_id)
            if order is None:
                raise ValidationError("Allocation references an order that cannot be settled")
            owed = (order.total_amount or ZERO) - (order.amount_paid or ZERO)
            if man.amount > owed:
                raise ValidationError(
                    f"The allocated amount for {order.order_ref} exceeds its outstanding balance"
                )
            seen.add(man.order_id)
            total += man.amount
            result.append((order, _q2(man.amount)))
        if total > payment_amount:
            raise ValidationError("Allocations cannot exceed the payment amount")
        return result

    @staticmethod
    def _recompute_payment_status(order: Order) -> None:
        total = order.total_amount or ZERO
        paid = order.amount_paid or ZERO
        paid = min(paid, total)  # never overflow past the order total
        order.amount_paid = _q2(paid)
        if paid >= total:
            order.payment_status = "paid"
        elif paid > 0:
            order.payment_status = "partial"
        else:
            order.payment_status = "unpaid"

    # ---- voiding (Owner only) ---------------------------------------------------------

    async def void_payment(self, entry_id: UUID, reason: str) -> PaymentRead:
        if self.user_id is None:
            raise ForbiddenError("The caller must be an Owner to void a payment")
        user = (
            await self.session.execute(select(User).where(User.id == self.user_id))
        ).scalar_one_or_none()
        if user is None or (not user.is_superadmin and user.role != "owner"):
            raise ForbiddenError("Only the Owner can void a payment")

        entry = await self.repo.get_entry(entry_id)
        if entry.status != "active":
            raise ConflictError("This payment has already been voided")

        entry.status = "voided"
        entry.voided_by = self.user_id
        entry.voided_at = datetime.now(UTC)
        entry.void_reason = reason or None

        for allocation in entry.allocations or []:
            order = allocation.order
            if order is None:
                continue
            order.amount_paid = _q2((order.amount_paid or ZERO) - allocation.amount_applied)
            if order.amount_paid < ZERO:
                order.amount_paid = ZERO
            self._recompute_payment_status(order)
        await self.session.flush()
        fresh = await self.repo.get_entry(entry_id)
        return self._payment_read(fresh)

    # ---- receipts ---------------------------------------------------------------

    async def get_receipt(self, entry_id: UUID) -> ReceiptRead:
        entry = await self.repo.get_entry(entry_id)
        return ReceiptRead(
            id=entry.id,
            receipt_number=entry.receipt_number,
            customer_id=entry.customer_id,
            customer_name=entry.customer_name,
            amount=entry.amount,
            method=entry.method,
            collected_at=entry.collected_at,
            note=entry.note,
            payer_bill_no=entry.payer_bill_no,
            collector_name=entry.collector_name,
            status=entry.status,
            voided_at=entry.voided_at,
            void_reason=entry.void_reason,
            snapshot=entry.receipt_snapshot,
            allocations=[
                PaymentAllocationRead(
                    order_id=a.order_id,
                    order_ref=a.order_ref,
                    amount_applied=a.amount_applied,
                )
                for a in (entry.allocations or [])
            ],
        )

    async def _resolved_snapshot(self, frozen: dict | None) -> dict:
        """Merge a frozen document snapshot with the current bill template.

        Documents freeze branding at creation time, but a template that was
        auto-created with empty fields (e.g. ``business_name=""``) would leak
        default placeholders like "My Business" into every PDF forever. Any
        field that is empty/missing in the frozen snapshot is backfilled from
        the live template; branding that was actually configured stays frozen.

        Layouts are NOT part of this merge — they are resolved separately via
        ``get_default_layout`` so documents always render with the tenant's
        current default layout.
        """
        live = await self.repo.get_template_or_create()
        live_snap = live.snapshot()
        merged = dict(frozen or {})
        for key in (
            "business_name",
            "tax_id",
            "address",
            "phone",
            "email",
            "footer_note",
            "invoice_tax_rate",
            "invoice_number_prefix",
            "receipt_number_prefix",
            "logo",
            "signature",
        ):
            if not merged.get(key):
                merged[key] = live_snap[key]
        return merged

    async def receipt_pdf(self, entry_id: UUID) -> bytes:
        entry = await self.repo.get_entry(entry_id)
        receipt = {
            "number": entry.receipt_number,
            "collected_at": entry.collected_at,
            "customer_name": entry.customer_name,
            "customer_phone": entry.customer.phone if entry.customer else None,
            "customer_address": entry.customer.address if entry.customer else None,
            "amount": entry.amount,
            "method": entry.method,
            "note": entry.note,
            "collector_name": entry.collector_name,
            "status": entry.status,
            "allocations": [
                {
                    "order_id": str(a.order_id),
                    "order_ref": a.order_ref,
                    "amount_applied": a.amount_applied,
                    "items": [
                        {
                            "product_name": it.product_name,
                            "variant_name": it.variant_name,
                            "unit": it.unit,
                            "quantity": str(it.quantity),
                            "unit_price": it.unit_price,
                            "amount": it.amount,
                        }
                        for it in (a.order.items if getattr(a, "order", None) else [])
                    ],
                }
                for a in (entry.allocations or [])
            ],
        }
        snapshot = await self._resolved_snapshot(entry.receipt_snapshot)
        layout = await self.get_default_layout("receipt")
        return pdf.render_receipt_pdf(snapshot=snapshot, layout=layout, receipt=receipt)

    # ---- invoices ---------------------------------------------------------------

    async def get_invoice(self, order_id: UUID, requested_by: UUID | None = None) -> InvoiceRead:
        order = await self.repo.get_order(order_id)
        if order.status in {"draft", "cancelled"}:
            raise ValidationError("Invoices are only available for placed orders")

        invoice = await self.repo.get_invoice_by_order(order_id)
        if invoice is None:
            template = await self.repo.get_template_or_create()
            number = f"{template.invoice_number_prefix}{template.next_invoice_number}"
            template.next_invoice_number += 1
            snapshot = template.snapshot()
            # Seed the editable document (line items + tax + note). Editing it
            # later never touches the order, its total or the khata ledger.
            subtotal = sum((it.amount or ZERO) for it in (order.items or []))
            data = {
                "tax_rate": str(template.invoice_tax_rate or 0),
                "note": order.notes,
                "items": [
                    {
                        "product_name": it.product_name,
                        "variant_name": it.variant_name,
                        "unit": it.unit,
                        "quantity": str(it.quantity),
                        "unit_price": str(it.unit_price),
                        "amount": str(it.amount),
                    }
                    for it in (order.items or [])
                ],
            }
            await self.repo.add_invoice(order_id, number, snapshot, requested_by, data=data)
            invoice = await self.repo.get_invoice_by_order(order_id)

        customer = order.customer
        # Editable document content (line items + tax + note). New invoices have
        # this seeded at creation (see get_invoice); legacy invoices created
        # before the `data` column fall back to the live order + template.
        stored = (invoice.data or {}) if getattr(invoice, "data", None) else {}
        if stored.get("items"):
            items = [
                InvoiceItemRead(
                    product_name=it["product_name"],
                    variant_name=it.get("variant_name"),
                    unit=it.get("unit"),
                    quantity=Decimal(str(it["quantity"])),
                    unit_price=Decimal(str(it["unit_price"])),
                    amount=Decimal(str(it["amount"])),
                )
                for it in stored["items"]
            ]
            items_total = sum((it.amount for it in items), Decimal("0"))
            tax_rate = Decimal(str(stored.get("tax_rate", "0")))
            tax_amount = (items_total * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
            note = stored.get("note")
        else:
            # Legacy fallback — derive items/tax from the live order.
            items = [
                InvoiceItemRead(
                    product_name=it.product_name,
                    variant_name=it.variant_name,
                    unit=it.unit,
                    quantity=it.quantity,
                    unit_price=it.unit_price,
                    amount=it.amount,
                )
                for it in (order.items or [])
            ]
            items_total = order.total_amount
            tax_rate = template.invoice_tax_rate if "template" in locals() else Decimal("0")
            tax_amount = (items_total * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
            note = order.notes

        total_with_tax = (items_total + tax_amount).quantize(Decimal("0.01"))
        return InvoiceRead(
            invoice_number=invoice.invoice_number,
            order_id=order.id,
            order_ref=order.order_ref,
            created_at=invoice.created_at,
            status=order.status,
            payment_status=order.payment_status,
            subtotal=items_total.quantize(Decimal("0.01")),
            tax_rate=tax_rate,
            tax_amount=tax_amount,
            total_amount=total_with_tax,
            amount_paid=order.amount_paid,
            customer_id=order.customer_id,
            customer_name=getattr(customer, "name", None) if customer else None,
            customer_phone=getattr(customer, "phone", None) if customer else None,
            customer_address=getattr(customer, "address", None) if customer else None,
            items=items,
            note=note,
            snapshot=invoice.template_snapshot,
        )

    async def invoice_pdf(self, order_id: UUID) -> bytes:
        order = await self.repo.get_order(order_id)
        if order.status in {"draft", "cancelled"}:
            raise ValidationError("Invoices are only available for placed orders")
        invoice = await self.repo.get_invoice_by_order(order_id)
        if invoice is None:
            await self.get_invoice(order_id)
            invoice = await self.repo.get_invoice_by_order(order_id)
            if invoice is None:  # pragma: no cover - defensive
                raise NotFoundError("Invoice could not be created")

        customer = order.customer
        payload = {
            "order_id": str(order.id),
            "order_ref": order.order_ref,
            "number": invoice.invoice_number,
            "created_at": invoice.created_at,
            "customer_name": getattr(customer, "name", None) if customer else None,
            "customer_phone": getattr(customer, "phone", None) if customer else None,
            "customer_address": getattr(customer, "address", None) if customer else None,
            "status": order.status,
            "payment_status": order.payment_status,
            "total_amount": order.total_amount,
            "amount_paid": order.amount_paid,
            "note": order.notes,
            "items": [
                {
                    "product_name": it.product_name,
                    "variant_name": it.variant_name,
                    "unit": it.unit,
                    "quantity": it.quantity,
                    "unit_price": it.unit_price,
                    "amount": it.amount,
                }
                for it in (order.items or [])
            ],
        }
        snapshot = await self._resolved_snapshot(invoice.template_snapshot)
        layout = await self.get_default_layout("invoice")
        return pdf.render_invoice_pdf(snapshot=snapshot, layout=layout, invoice=payload)

    # ---- bill template ---------------------------------------------------------------

    async def get_template_read(self) -> BillTemplateRead:
        template = await self.repo.get_template_or_create()
        return self._template_read(template)

    async def update_template(self, data: BillTemplateUpdate) -> BillTemplateRead:
        template = await self.repo.get_template_or_create()
        updates = data.model_dump(exclude_unset=True)
        # Validate + normalize layout before writing anything else.
        # TODO(remove-template-layout): the `layout` field on the bill template
        # is deprecated — layouts now live in bill_layouts presets. Keep this
        # path for back-compat until the new frontend stops sending it, then
        # drop the field and the bill_templates.layout column.
        layout_raw = updates.pop("layout", None)
        if layout_raw is not None:
            try:
                template.layout = normalize_layout(layout_raw, strict=True)
            except ValueError as exc:
                raise ValidationError(str(exc)) from exc
        for field, value in updates.items():
            if field in {"invoice_number_prefix", "receipt_number_prefix"} and value is not None:
                value = value.strip() or value
            setattr(template, field, value)
        await self.session.flush()
        return self._template_read(template)

    async def upload_image(self, kind: str, mime: str, content: bytes) -> BillTemplateRead:
        if kind not in {"logo", "signature"}:
            raise ValidationError("Image kind must be 'logo' or 'signature'")
        if mime.lower() not in ALLOWED_IMAGE_MIMES:
            raise ValidationError("Image must be PNG, JPG, GIF or WebP")
        if len(content) > MAX_IMAGE_BYTES:
            raise ValidationError(f"Image must be smaller than {MAX_IMAGE_BYTES // 1024 // 1024}MB")
        template = await self.repo.get_template_or_create()
        if kind == "logo":
            template.logo_mime = mime.lower()
            template.logo_data = content
        else:
            template.signature_mime = mime.lower()
            template.signature_data = content
        await self.session.flush()
        return self._template_read(template)

    def _template_read(self, template: BillTemplate) -> BillTemplateRead:
        def _asset(mime: str | None, data: bytes | None) -> ImageAsset | None:
            if not mime or not data:
                return None
            return ImageAsset(
                mime=mime,
                data_url=f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}",
            )

        return BillTemplateRead(
            business_name=template.business_name,
            tax_id=template.tax_id,
            address=template.address,
            phone=template.phone,
            email=template.email,
            footer_note=template.footer_note,
            invoice_number_prefix=template.invoice_number_prefix,
            receipt_number_prefix=template.receipt_number_prefix,
            next_invoice_number=template.next_invoice_number,
            next_receipt_number=template.next_receipt_number,
            logo=_asset(template.logo_mime, template.logo_data),
            signature=_asset(template.signature_mime, template.signature_data),
            # Deprecated field — see BillTemplateRead.layout.
            layout=normalize_layout(template.layout),
        )

    # ---- bill layout presets -------------------------------------------------------

    async def get_default_layout(self, doc_type: str) -> dict:
        """Resolve the layout that renders ``doc_type`` documents right now.

        Returned layout is never stored on the document — it is looked up (and,
        if the tenant has no preset yet, created as "Standard") at render time,
        so changing the default preset in Settings changes every document for
        the whole tenant, old ones included.
        """
        if doc_type not in {"invoice", "receipt"}:
            raise ValidationError("doc_type must be 'invoice' or 'receipt'")
        preset = await self.repo.get_default_bill_layout(doc_type)
        if preset is None:
            preset = await self._ensure_standard_preset()
        return normalize_layout(preset.layout)

    async def _ensure_standard_preset(self) -> BillLayout:
        """Lazily create a "Standard" preset from the bill template's layout.

        Only claims the default flags that are currently unset so the partial
        unique indexes can never be violated.
        """
        template = await self.repo.get_template_or_create()
        layout = normalize_layout(template.layout or default_layout())
        has_invoice = await self.repo.get_default_bill_layout("invoice")
        has_receipt = await self.repo.get_default_bill_layout("receipt")
        # The name is unique per tenant: if "Standard" was renamed away and is
        # gone we recreate it, otherwise we fall back to the renamed row.
        existing = {p.name: p for p in await self.repo.list_bill_layouts()}
        if "Standard" in existing:
            return existing["Standard"]
        return await self.repo.add_bill_layout(
            "Standard",
            layout,
            is_default_invoice=has_invoice is None,
            is_default_receipt=has_receipt is None,
        )

    def _preset_read(self, preset: BillLayout) -> BillLayoutPresetRead:
        return BillLayoutPresetRead(
            id=preset.id,
            name=preset.name,
            layout=normalize_layout(preset.layout),
            is_default_invoice=preset.is_default_invoice,
            is_default_receipt=preset.is_default_receipt,
            updated_at=preset.updated_at,
        )

    async def list_bill_layouts(self) -> list[BillLayoutPresetRead]:
        presets = await self.repo.list_bill_layouts()
        if not presets:
            # Tenants created after this feature (or whose template was updated
            # before it) get their "Standard" preset lazily on first read.
            presets = [await self._ensure_standard_preset()]
        presets.sort(
            key=lambda p: (not (p.is_default_invoice or p.is_default_receipt), p.name.lower())
        )
        return [self._preset_read(p) for p in presets]

    async def create_bill_layout(self, data: BillLayoutPresetCreate) -> BillLayoutPresetRead:
        name = data.name.strip()
        if not name:
            raise ValidationError("Layout name cannot be empty")
        try:
            layout = normalize_layout(data.layout, strict=True)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        existing_names = {
            p.name for p in await self.repo.list_bill_layouts()
        }
        if name in existing_names:
            raise ConflictError("A bill layout with this name already exists")
        # The tenant's very first preset becomes the default for both doc types.
        is_first = await self.repo.count_bill_layouts() == 0
        preset = await self.repo.add_bill_layout(
            name,
            layout,
            is_default_invoice=is_first,
            is_default_receipt=is_first,
        )
        return self._preset_read(preset)

    async def update_bill_layout(
        self, preset_id: UUID, data: BillLayoutPresetUpdate
    ) -> BillLayoutPresetRead:
        preset = await self.repo.get_bill_layout(preset_id)
        updates = data.model_dump(exclude_unset=True)
        name = updates.pop("name", None)
        if name is not None:
            name = name.strip()
            if not name:
                raise ValidationError("Layout name cannot be empty")
            if name != preset.name:
                siblings = await self.repo.list_bill_layouts()
                if any(p.id != preset_id and p.name == name for p in siblings):
                    raise ConflictError("A bill layout with this name already exists")
            preset.name = name
        layout_raw = updates.pop("layout", None)
        if layout_raw is not None:
            try:
                preset.layout = normalize_layout(layout_raw, strict=True)
            except ValueError as exc:
                raise ValidationError(str(exc)) from exc
        await self.session.flush()
        return self._preset_read(preset)

    async def delete_bill_layout(self, preset_id: UUID) -> None:
        preset = await self.repo.get_bill_layout(preset_id)
        if preset.is_default_invoice or preset.is_default_receipt:
            raise ConflictError(
                "This layout is in use as the default for invoices or receipts. "
                "Make another layout the default first."
            )
        if await self.repo.count_bill_layouts() <= 1:
            raise ConflictError("You cannot delete the last layout. Create another layout first.")
        await self.session.delete(preset)
        await self.session.flush()

    async def set_default_bill_layout(
        self, preset_id: UUID, data: SetBillLayoutDefaultInput
    ) -> BillLayoutPresetRead:
        preset = await self.repo.get_bill_layout(preset_id)
        column = "is_default_invoice" if data.doc_type == "invoice" else "is_default_receipt"
        # Atomic switch for this doc type: clear the old default, set the new
        # one — both within the same transaction (the partial unique index in
        # the DB guarantees at most one row can be the default at a time).
        await self.session.execute(
            update(BillLayout)
            .where(
                BillLayout.tenant_id == self.tenant_id,
                getattr(BillLayout, column).is_(True),
            )
            .values(**{column: False}, updated_at=func.now())
        )
        await self.session.execute(
            update(BillLayout)
            .where(BillLayout.id == preset_id)
            .values(**{column: True}, updated_at=func.now())
        )
        await self.session.refresh(preset)
        return self._preset_read(preset)