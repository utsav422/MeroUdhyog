"""Server-side PDF rendering for Khata receipts and invoices (ReportLab).

The layout of a document is driven by the tenant's saved bill layout — an
ordered list of blocks (see ``app.modules.khata.layout``). Each block is
rendered in order and skipped when it is disabled for the document type, so the
printed PDF mirrors the frontend Bill Format designer exactly.
"""

from __future__ import annotations

import base64
import io
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.modules.khata.layout import normalize_layout

BRAND = colors.HexColor("#1b4332")
BRAND_LIGHT = colors.HexColor("#eaf3ee")
MUTED = colors.HexColor("#6b7280")
BORDER = colors.HexColor("#e4e7ee")

ZERO = Decimal("0.00")


def _money(value: Decimal | None) -> str:
    v = float(value if value is not None else ZERO)
    return f"{v:,.2f}"


def _fmt_date(dt) -> str:
    if dt is None:
        return "—"
    return dt.strftime("%d %b %Y")


def _img_bytes(snap_img: dict | None) -> tuple[str, bytes] | None:
    if not snap_img:
        return None
    try:
        data = base64.b64decode(snap_img["data_b64"])
    except Exception:
        return None
    if not data:
        return None
    return (snap_img.get("mime") or "image/png", data)


def _scaled_image(data: bytes, max_w: float, max_h: float):
    reader = ImageReader(io.BytesIO(data))
    w, h = reader.getSize()
    if h <= 0:
        return None
    ratio = min(max_w / w, max_h / h, 1.0)
    return Image(io.BytesIO(data), width=w * ratio, height=h * ratio)


def _logo_flowable(snap_img: dict | None):
    img = _img_bytes(snap_img)
    if not img:
        return None
    try:
        return _scaled_image(img[1], 1.4 * inch, 0.8 * inch)
    except Exception:
        return None


def _signature_flowable(snap_img: dict | None):
    img = _img_bytes(snap_img)
    if not img:
        return None
    try:
        return _scaled_image(img[1], 1.6 * inch, 0.6 * inch)
    except Exception:
        return None


def _linear_table(rows, col_widths=None, align_right_last=False):
    table = Table(rows, colWidths=col_widths)
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    if align_right_last:
        table.setStyle(TableStyle([("ALIGN", (-1, 0), (-1, -1), "RIGHT")]))
    return table


def _bold(parent: ParagraphStyle, name: str) -> ParagraphStyle:
    return ParagraphStyle(name, parent=parent, fontName="Helvetica-Bold")


def _base_story(doc_title: str, snap: dict | None) -> tuple[list, object, object]:
    snap = snap or {}
    styles = getSampleStyleSheet()
    small = ParagraphStyle(
        "Small",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        textColor=MUTED,
        leading=11,
    )
    body = ParagraphStyle(
        "Body", parent=styles["Normal"], fontName="Helvetica", fontSize=9.5, leading=13
    )
    brand_pill = ParagraphStyle(
        "BrandPill",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=colors.white,
    )

    story: list = []

    band = Table([[Paragraph(doc_title, brand_pill)]])
    band.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BRAND),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    band.hAlign = "LEFT"
    story.append(band)
    story.append(Spacer(1, 12))

    return (story, small, body)


# ---- block renderers ---------------------------------------------------------


def _block_branding(doc_type: str, snap: dict, payload: dict, small, body) -> list:
    h1 = ParagraphStyle(
        "BrandName",
        parent=getSampleStyleSheet()["Title"],
        fontName="Helvetica-Bold",
        fontSize=20,
        textColor=colors.black,
        spaceAfter=0,
    )
    right_col = [Paragraph(snap.get("business_name") or "My Business", h1)]
    if snap.get("tax_id"):
        right_col.append(Paragraph(f"PAN/VAT: {snap['tax_id']}", small))
    addr_parts = []
    if snap.get("address"):
        addr_parts.append(str(snap["address"]))
    if snap.get("phone"):
        addr_parts.append(f"Tel: {snap['phone']}")
    if snap.get("email"):
        addr_parts.append(str(snap["email"]))
    if addr_parts:
        right_col.append(Paragraph("<br/>".join(addr_parts), small))

    logo = _logo_flowable(snap.get("logo"))
    if logo is not None:
        header_table = Table([[logo, right_col]], colWidths=[2.2 * inch, None])
    else:
        header_table = Table([[right_col]])
    header_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return [header_table, Spacer(1, 10)]


def _block_document_meta(doc_type: str, snap: dict, payload: dict, small, body) -> list:
    if doc_type == "receipt":
        number_label = f"Receipt no: <b>{payload.get('number') or '—'}</b>"
        date_value = payload.get("collected_at")
        meta = Table(
            [
                [
                    Paragraph(number_label, body),
                    Paragraph(f"Date: <b>{_fmt_date(date_value)}</b>", body),
                ]
            ]
        )
    else:
        number_label = f"Invoice no: <b>{payload.get('number') or '—'}</b>"
        order_ref = payload.get("order_ref")
        date_value = payload.get("created_at")
        meta = Table(
            [
                [
                    Paragraph(number_label, body),
                    Paragraph(f"Order: <b>{order_ref or '—'}</b>", body),
                    Paragraph(f"Date: <b>{_fmt_date(date_value)}</b>", body),
                ]
            ]
        )
    meta.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ]
        )
    )
    return [meta, Spacer(1, 8)]


def _block_customer(doc_type: str, snap: dict, payload: dict, small, body) -> list:
    label = "Bill to" if doc_type == "invoice" else "Customer"
    cust = _bold(body, "CustomerLabel")
    c_lines = [payload.get("customer_name") or "—"]
    if payload.get("customer_phone"):
        c_lines.append(f"Tel: {payload['customer_phone']}")
    if payload.get("customer_address"):
        c_lines.append(str(payload["customer_address"]))
    return [
        Paragraph(label, cust),
        Spacer(1, 2),
        Paragraph("<br/>".join(c_lines), body),
        Spacer(1, 12),
    ]


def _block_order_status(doc_type: str, snap: dict, payload: dict, small, body) -> list:
    line = (
        f"Order status: <b>{payload.get('status') or '—'}</b> · "
        f"Payment: <b>{payload.get('payment_status') or '—'}</b>"
    )
    return [Paragraph(line, body), Spacer(1, 8)]


def _block_items(doc_type: str, snap: dict, payload: dict, small, body) -> list:
    if doc_type == "invoice":
        items = payload.get("items") or []
        rows = [
            [
                Paragraph("Item", small),
                Paragraph("Qty", small),
                Paragraph("Unit price", small),
                Paragraph("Amount", small),
            ]
        ]
        for it in items:
            name = it.get("product_name") or "—"
            if it.get("variant_name"):
                name = f"{name} ({it['variant_name']})"
            if it.get("unit"):
                name = f"{name} / {it['unit']}"
            rows.append(
                [
                    Paragraph(name, body),
                    Paragraph(f"{float(it.get('quantity') or 0):g}", body),
                    Paragraph(_money(it.get("unit_price")), body),
                    Paragraph(_money(it.get("amount")), body),
                ]
            )
        items_table = Table(rows, colWidths=[None, 0.9 * inch, 1.1 * inch, None])
        items_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), BRAND),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                    ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                    ("ALIGN", (1, 0), (1, -1), "CENTER"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        return [items_table, Spacer(1, 8)]

    allocations = payload.get("allocations") or []
    if not allocations:
        return []
    story: list = [
        Spacer(1, 12),
        Paragraph("Applied to orders", _bold(body, "AppliedLabel")),
        Spacer(1, 4),
    ]
    for alloc in allocations:
        story.extend(_allocation_flowable(alloc, small, body))
    return story


def _allocation_flowable(alloc: dict, small, body) -> list:
    """One linked order on a receipt: its ref, the applied amount and the
    products it is paying for."""
    order_label = f"Order no: <b>{alloc.get('order_ref') or '—'}</b>"
    applied = _money(alloc.get("amount_applied"))
    applied_style = _bold(body, "AppliedAmount")
    header = Table(
        [[Paragraph(order_label, body), Paragraph(f"Applied: <b>{applied}</b>", applied_style)]],
        colWidths=[None, 2.2 * inch],
    )
    header.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )

    items = alloc.get("items") or []
    if not items:
        return [header]

    rows = [
        [
            Paragraph("Item", small),
            Paragraph("Qty", small),
            Paragraph("Unit price", small),
            Paragraph("Amount", small),
        ]
    ]
    for it in items:
        name = it.get("product_name") or "—"
        if it.get("variant_name"):
            name = f"{name} ({it['variant_name']})"
        if it.get("unit"):
            name = f"{name} / {it['unit']}"
        rows.append(
            [
                Paragraph(name, body),
                Paragraph(f"{float(it.get('quantity') or 0):g}", body),
                Paragraph(_money(it.get("unit_price")), body),
                Paragraph(_money(it.get("amount")), body),
            ]
        )
    items_table = Table(rows, colWidths=[None, 0.9 * inch, 1.1 * inch, None])
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 0), (-1, 0), BRAND),
                ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (1, 0), (1, -1), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return [header, items_table, Spacer(1, 10)]


def _block_totals(doc_type: str, snap: dict, payload: dict, small, body) -> list:
    if doc_type == "invoice":
        totals = _linear_table(
            [
                [
                    Paragraph("Total", body),
                    Paragraph(f"<b>{_money(payload.get('total_amount'))}</b>", body),
                ],
                [
                    Paragraph("Amount paid", body),
                    Paragraph(_money(payload.get("amount_paid")), body),
                ],
            ],
            col_widths=[2.2 * inch, 2.0 * inch],
            align_right_last=True,
        )
        return [totals]

    big = ParagraphStyle("Big", parent=body, fontSize=13)
    received = Table(
        [
            [
                Paragraph("AMOUNT PAID", small),
                Paragraph("PAYMENT METHOD", small),
                Paragraph("DATE COLLECTED", small),
            ],
            [
                Paragraph(f"<b>{_money(payload.get('amount'))}</b>", big),
                Paragraph(payload.get("method") or "—", body),
                Paragraph(_fmt_date(payload.get("collected_at")), body),
            ],
        ],
        colWidths=[2.1 * inch, 2.1 * inch, None],
    )
    received.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
                ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return [received]


def _block_notes(doc_type: str, snap: dict, payload: dict, small, body) -> list:
    story: list = []
    note = payload.get("note")
    if note:
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"Note: {note}", body))
    if doc_type == "receipt" and payload.get("collector_name"):
        story.append(Spacer(1, 6))
        story.append(Paragraph(f"Collected by: {payload['collector_name']}", small))
    return story


def _block_footer_note(doc_type: str, snap: dict, payload: dict, small, body) -> list:
    if not snap.get("footer_note"):
        return []
    footer_style = ParagraphStyle(
        "Footer", parent=small, fontName="Helvetica-Oblique", fontSize=8.5
    )
    return [Spacer(1, 14), Paragraph(str(snap["footer_note"]), footer_style)]


def _block_signature(doc_type: str, snap: dict, payload: dict, small, body) -> list:
    sign = _signature_flowable(snap.get("signature"))
    if sign is None:
        return []
    label = ParagraphStyle(
        "SignLabel", parent=small, fontName="Helvetica", fontSize=8.5
    )
    sign_table = Table(
        [[sign, Paragraph("Authorized signature", label)]],
        colWidths=[2.0 * inch, None],
    )
    sign_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return [Spacer(1, 14), sign_table]


_BLOCK_RENDERERS = {
    "branding": _block_branding,
    "document_meta": _block_document_meta,
    "customer": _block_customer,
    "order_status": _block_order_status,
    "items": _block_items,
    "totals": _block_totals,
    "notes": _block_notes,
    "footer_note": _block_footer_note,
    "signature": _block_signature,
}


def _new_page(stream, doc_title):
    return SimpleDocTemplate(
        stream,
        pagesize=A4,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
        title=doc_title,
    )


def _build(page, story, watermark: str | None) -> None:
    if not watermark:
        page.build(story)
        return

    def _watermark(canv: pdf_canvas.Canvas, doc) -> None:
        canv.saveState()
        canv.setFont("Helvetica-Bold", 64)
        canv.setFillColor(colors.Color(0.7, 0.1, 0.1, alpha=0.18))
        canv.translate(canv._pagesize[0] / 2.0, canv._pagesize[1] / 2.0)
        canv.rotate(45)
        canv.drawCentredString(0, 0, watermark)
        canv.restoreState()

    page.build(story, onFirstPage=_watermark, onLaterPages=_watermark)


def _render_document(
    stream,
    *,
    doc_type: str,
    snapshot: dict | None,
    payload: dict,
    watermark: str | None = None,
) -> bytes:
    title = "Payment Receipt" if doc_type == "receipt" else "Invoice"
    page = _new_page(stream, title)
    story, small, body = _base_story(title, snapshot)

    snap = snapshot or {}
    layout = normalize_layout(snap.get("layout"))
    for block in layout["blocks"]:
        if not block["enabled"].get(doc_type, False):
            continue
        renderer = _BLOCK_RENDERERS.get(block["id"])
        if renderer is None:
            continue
        pieces = renderer(doc_type, snap, payload, small, body)
        align = block.get("align")
        if align in {"center", "right"}:
            h_align = align.upper()
            for piece in pieces:
                if hasattr(piece, "hAlign"):
                    piece.hAlign = h_align
        story.extend(pieces)

    story.append(Spacer(1, 16))
    gen = ParagraphStyle("Gen", parent=small, fontName="Helvetica", fontSize=7.5)
    story.append(Paragraph("This is a computer-generated document issued by FactoryCRM.", gen))
    _build(page, story, watermark)
    return stream.getvalue()


def render_receipt_pdf(*, snapshot: dict | None, receipt) -> bytes:
    """Render a receipt PDF.

    `receipt` carries the flattened fields: number, collected_at, customer_name,
    customer_phone, customer_address, amount, method, note, collector_name,
    allocations, status. Each allocation carries order_id, order_ref,
    amount_applied and the order's items (product_name, variant_name, unit,
    quantity, unit_price, amount).
    """
    return _render_document(
        io.BytesIO(),
        doc_type="receipt",
        snapshot=snapshot,
        payload=receipt,
        watermark="VOIDED" if receipt.get("status") == "voided" else None,
    )


def render_invoice_pdf(*, snapshot: dict | None, invoice) -> bytes:
    """Render an invoice PDF.

    `invoice` carries: number, order_id, order_ref, created_at, customer_name,
    customer_phone, customer_address, status, payment_status, total_amount,
    amount_paid, items.
    """
    return _render_document(
        io.BytesIO(),
        doc_type="invoice",
        snapshot=snapshot,
        payload=invoice,
        watermark=None,
    )