"""Bill layout: the structured, printable block list shared by receipts and
invoices.

A layout is an ordered list of blocks. Each block knows which document types it
applies to, whether it is enabled for them, and (for alignable blocks) where it
sits on the line. The same normalized structure is used by:

* the ReportLab renderer (``pdf.py``), which prints the blocks in order, and
* the frontend Bill Format designer, which previews the exact same blocks.

The DB stores the raw JSON; ``normalize_layout`` is the single entry point that
merges any stored value with the defaults so a layout is always complete and
valid. New blocks added later (in code) automatically appear at the end of any
older saved layout.
"""

from __future__ import annotations

import copy
from typing import NamedTuple

DOC_TYPES = ("invoice", "receipt")
ALIGNS = {"left", "center", "right"}


class BlockSpec(NamedTuple):
    id: str
    label: str
    applies: tuple[str, ...]
    alignable: bool


BLOCKS: list[BlockSpec] = [
    BlockSpec("branding", "Logo & business name", DOC_TYPES, True),
    BlockSpec("document_meta", "Document number & date", DOC_TYPES, True),
    BlockSpec("customer", "Customer details", DOC_TYPES, True),
    BlockSpec("order_status", "Order & payment status", ("invoice",), False),
    BlockSpec("items", "Items / Applied orders", DOC_TYPES, False),
    BlockSpec("totals", "Total & payment summary", DOC_TYPES, True),
    BlockSpec("notes", "Note & collector", DOC_TYPES, False),
    BlockSpec("footer_note", "Footer message", DOC_TYPES, True),
    BlockSpec("signature", "Authorized signature", ("invoice",), True),
]

BLOCK_MAP = {block.id: block for block in BLOCKS}


def _default_block(spec: BlockSpec) -> dict:
    return {
        "id": spec.id,
        "label": spec.label,
        "applies": list(spec.applies),
        "alignable": spec.alignable,
        "enabled": dict.fromkeys(spec.applies, True),
        "align": "left",
    }


def default_layout() -> dict:
    blocks = []
    for spec in BLOCKS:
        block = _default_block(spec)
        if spec.id == "totals":
            block["align"] = "right"
        elif spec.id == "footer_note":
            block["align"] = "center"
        blocks.append(block)
    return {"blocks": blocks}


DEFAULT_LAYOUT = default_layout()


def normalize_layout(raw, *, strict: bool = False) -> dict:
    """Validate + merge a stored layout into the canonical form.

    Lenient mode (reads) drops unknown block ids and tolerates missing fields,
    then appends any current default blocks that are missing. Strict mode (saves)
    rejects unknown ids and invalid values so bad data never reaches the DB.
    """
    if not isinstance(raw, dict) or not isinstance(raw.get("blocks"), list):
        if strict:
            raise ValueError("Layout must contain a 'blocks' list")
        return copy.deepcopy(DEFAULT_LAYOUT)

    seen: set[str] = set()
    blocks: list[dict] = []
    for item in raw["blocks"]:
        if not isinstance(item, dict):
            if strict:
                raise ValueError("Each layout block must be an object")
            continue
        block_id = item.get("id")
        spec = BLOCK_MAP.get(block_id)
        if spec is None:
            if strict:
                raise ValueError(f"Unknown layout block: {block_id!r}")
            continue

        enabled_input = item.get("enabled")
        if enabled_input is not None and not isinstance(enabled_input, dict):
            if strict:
                raise ValueError(f"enabled for block {block_id!r} must be an object")
            enabled_input = {}
        enabled: dict[str, bool] = {}
        for doc in spec.applies:
            value = True
            if isinstance(enabled_input, dict):
                candidate = enabled_input.get(doc)
                if isinstance(candidate, bool):
                    value = candidate
                elif candidate is not None and strict:
                    raise ValueError(f"enabled.{doc} for block {block_id!r} must be a boolean")
            enabled[doc] = value

        align = "left"
        if spec.alignable:
            candidate = item.get("align", "left")
            if candidate in ALIGNS:
                align = candidate
            elif candidate is not None and strict:
                raise ValueError(
                    f"align for block {block_id!r} must be one of: left, center, right"
                )

        blocks.append(
            {
                "id": spec.id,
                "label": spec.label,
                "applies": list(spec.applies),
                "alignable": spec.alignable,
                "enabled": enabled,
                "align": align,
            }
        )
        seen.add(spec.id)

    for spec in BLOCKS:
        if spec.id not in seen:
            blocks.append(_default_block(spec))
    return {"blocks": blocks}