"""Deterministic audit rules over the transactions ledger.

Each rule is a pure function: given a list of ledger rows it returns the
findings it detects. Rules are side-effect free and produce identical output for
identical input, which keeps the audit explainable and testable.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID


@dataclass(frozen=True)
class LedgerEntry:
    id: UUID
    type: str
    amount: Decimal | None
    tax_amount: Decimal | None
    discount_amount: Decimal | None
    transaction_date: datetime
    currency: str | None
    reverses_id: UUID | None
    external_id: str | None


@dataclass(frozen=True)
class FindingSpec:
    rule_code: str
    severity: str
    transaction_id: UUID | None
    message: str
    evidence: dict | None


SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}
MAX_MESSAGE_LEN = 500


def _msg(value: str) -> str:
    return value[:MAX_MESSAGE_LEN]


def rule_negative_amount(entries: list[LedgerEntry]) -> list[FindingSpec]:
    found: list[FindingSpec] = []
    for e in entries:
        if e.amount is not None and e.amount < 0 and e.reverses_id is None:
            found.append(
                FindingSpec(
                    rule_code="negative_amount",
                    severity="high",
                    transaction_id=e.id,
                    message=_msg(
                        f"Transaction {e.id} has a negative amount ({e.amount}) "
                        "and is not recorded as a reversal."
                    ),
                    evidence={
                        "type": e.type,
                        "amount": str(e.amount),
                        "reverses_id": str(e.reverses_id) if e.reverses_id else None,
                    },
                )
            )
    return found


def rule_zero_amount(entries: list[LedgerEntry]) -> list[FindingSpec]:
    found: list[FindingSpec] = []
    for e in entries:
        if e.amount == 0:
            found.append(
                FindingSpec(
                    rule_code="zero_amount",
                    severity="medium",
                    transaction_id=e.id,
                    message=_msg(f"Transaction {e.id} has a zero amount."),
                    evidence={"type": e.type, "amount": "0"},
                )
            )
    return found


def rule_tax_greater_than_amount(entries: list[LedgerEntry]) -> list[FindingSpec]:
    found: list[FindingSpec] = []
    for e in entries:
        if (
            e.amount is not None
            and e.tax_amount is not None
            and e.amount > 0
            and e.tax_amount > e.amount
        ):
            found.append(
                FindingSpec(
                    rule_code="tax_greater_than_amount",
                    severity="low",
                    transaction_id=e.id,
                    message=_msg(
                        f"Transaction {e.id} has tax ({e.tax_amount}) greater than "
                        f"its amount ({e.amount})."
                    ),
                    evidence={
                        "amount": str(e.amount),
                        "tax_amount": str(e.tax_amount),
                    },
                )
            )
    return found


def rule_discount_greater_than_amount(entries: list[LedgerEntry]) -> list[FindingSpec]:
    found: list[FindingSpec] = []
    for e in entries:
        if (
            e.amount is not None
            and e.discount_amount is not None
            and e.amount > 0
            and e.discount_amount > e.amount
        ):
            found.append(
                FindingSpec(
                    rule_code="discount_greater_than_amount",
                    severity="low",
                    transaction_id=e.id,
                    message=_msg(
                        f"Transaction {e.id} has a discount ({e.discount_amount}) "
                        f"greater than its amount ({e.amount})."
                    ),
                    evidence={
                        "amount": str(e.amount),
                        "discount_amount": str(e.discount_amount),
                    },
                )
            )
    return found


def rule_future_dated(entries: list[LedgerEntry], now: datetime | None = None) -> list[FindingSpec]:
    reference = now or datetime.now(UTC)
    found: list[FindingSpec] = []
    for e in entries:
        if e.transaction_date.tzinfo is None:
            compare = e.transaction_date.replace(tzinfo=UTC)
        else:
            compare = e.transaction_date
        if compare > reference:
            found.append(
                FindingSpec(
                    rule_code="future_dated",
                    severity="medium",
                    transaction_id=e.id,
                    message=_msg(
                        f"Transaction {e.id} is dated in the future "
                        f"({e.transaction_date.isoformat()})."
                    ),
                    evidence={"transaction_date": e.transaction_date.isoformat()},
                )
            )
    return found


RULES = (
    rule_negative_amount,
    rule_zero_amount,
    rule_tax_greater_than_amount,
    rule_discount_greater_than_amount,
    rule_future_dated,
)

# Documented rule metadata for the API/Admin display.
RULE_CATALOG: dict[str, dict] = {
    "negative_amount": {
        "severity": "high",
        "description": "A non-reversal transaction has a negative amount.",
    },
    "zero_amount": {
        "severity": "medium",
        "description": "A transaction has a zero amount.",
    },
    "tax_greater_than_amount": {
        "severity": "low",
        "description": "Tax is greater than the transaction amount.",
    },
    "discount_greater_than_amount": {
        "severity": "low",
        "description": "Discount is greater than the transaction amount.",
    },
    "future_dated": {
        "severity": "medium",
        "description": "The transaction is dated in the future.",
    },
}


def run_rules(entries: list[LedgerEntry], now: datetime | None = None) -> list[FindingSpec]:
    findings: list[FindingSpec] = []
    for rule in RULES:
        if rule is rule_future_dated:
            findings.extend(rule(entries, now))
        else:
            findings.extend(rule(entries))
    findings.sort(
        key=lambda f: (SEVERITY_ORDER.get(f.severity, 0), f.rule_code, str(f.transaction_id))
    )
    return findings
