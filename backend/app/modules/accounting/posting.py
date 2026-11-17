from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.audit import record
from app.modules.accounting.models import (
    Account,
    AccountingSettings,
    JournalEntry,
    JournalLine,
)
from app.modules.accounting.repository import AccountingRepository
from app.modules.orders.models import OrderItem
from app.modules.products.models import (
    InventoryMovement,
    Product,
    ProductVariant,
    VariantPrice,
)
from app.modules.transactions.models import Transaction
from app.shared.exceptions import ConflictError, ValidationError

ZERO = Decimal("0.00")
CENT = Decimal("0.01")

ACCOUNT_CODES = {
    "cash": "1010",
    "bank": "1020",
    "receivable": "1030",
    "inventory": "1050",
    "vat_input": "1070",
    "tds_receivable": "1085",
    "vat_output": "2030",
    "tds_payable": "2040",
    "sales": "4000",
    "cogs": "5000",
    "expense_default": "6190",
    "other_assets": "1090",
    "payable": "2010",
    "loans": "2110",
    "capital": "3010",
    "retained_earnings": "3030",
    "opening_equity": "3090",
}

BANK_METHODS = {
    "bank",
    "bank_transfer",
    "bank-transfer",
    "cheque",
    "check",
    "card",
    "esewa",
    "khalti",
    "online",
    "wallet",
    "qr",
}

VOUCHER_PREFIX = {
    "sales": "SAL",
    "purchase": "PUR",
    "receipt": "RCP",
    "payment": "PAY",
    "expense": "EXP",
    "contra": "CTR",
    "journal": "JRN",
    "opening": "OPN",
    "closing": "CLS",
    "adjustment": "ADJ",
    "reversal": "REV",
}


def _q(value: Decimal | int | str | None) -> Decimal:
    return Decimal(value or 0).quantize(CENT)


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass
class PostingLine:
    account: Account
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    description: str | None = None
    party_type: str | None = None
    party_id: UUID | None = None


@dataclass
class ManualPostingLine:
    account_id: UUID
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    description: str | None = None
    party_type: str | None = None
    party_id: UUID | None = None


class PostingService:
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        user_id: UUID | None = None,
    ) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.repo = AccountingRepository(session, tenant_id)
        self._settings: AccountingSettings | None = None
        self._accounts_by_code: dict[str, Account] = {}
        self._accounts_by_id: dict[UUID, Account] = {}

    async def _get_settings(self) -> AccountingSettings:
        if self._settings is None:
            self._settings = await self.repo.ensure_settings()
        return self._settings

    async def _account_optional(self, code: str) -> Account | None:
        if code in self._accounts_by_code:
            return self._accounts_by_code[code]
        account = (
            await self.session.execute(
                select(Account).where(
                    Account.tenant_id == self.tenant_id,
                    Account.code == code,
                )
            )
        ).scalar_one_or_none()
        if account is not None:
            self._accounts_by_code[code] = account
            self._accounts_by_id[account.id] = account
        return account

    async def _account(self, code: str) -> Account:
        account = await self._account_optional(code)
        if account is None or account.is_group:
            raise ValidationError(f"Chart of accounts is missing postable account {code}")
        return account

    async def _account_by_id(self, account_id: UUID) -> Account:
        if account_id in self._accounts_by_id:
            return self._accounts_by_id[account_id]
        account = (
            await self.session.execute(
                select(Account).where(
                    Account.tenant_id == self.tenant_id,
                    Account.id == account_id,
                )
            )
        ).scalar_one_or_none()
        if account is None:
            raise ValidationError("Journal line references an unknown account")
        self._accounts_by_id[account_id] = account
        return account

    def _fiscal_label(self, entry_date: date, start_month: int) -> str:
        if start_month <= 1:
            return str(entry_date.year)
        if entry_date.month >= start_month:
            return f"{entry_date.year}-{str(entry_date.year + 1)[-2:]}"
        return f"{entry_date.year - 1}-{str(entry_date.year)[-2:]}"

    async def _next_entry_no(self, voucher_type: str, entry_date: date) -> str:
        settings = await self._get_settings()
        label = self._fiscal_label(entry_date, settings.fiscal_year_start_month)
        prefix = VOUCHER_PREFIX.get(voucher_type, "JRN")
        lock_key = f"journal:{self.tenant_id}:{voucher_type}:{label}"
        await self.session.execute(select(func.pg_advisory_xact_lock(func.hashtext(lock_key))))
        pattern = f"{prefix}-{label}-%"
        last = (
            await self.session.execute(
                select(func.max(JournalEntry.entry_no)).where(
                    JournalEntry.tenant_id == self.tenant_id,
                    JournalEntry.voucher_type == voucher_type,
                    JournalEntry.entry_no.like(pattern),
                )
            )
        ).scalar_one_or_none()
        seq = 1
        if last:
            try:
                seq = int(last.rsplit("-", 1)[-1]) + 1
            except ValueError:
                seq = 1
        return f"{prefix}-{label}-{seq:05d}"

    async def post_manual(
        self,
        *,
        entry_date: date,
        voucher_type: str,
        lines: list[ManualPostingLine],
        reference: str | None = None,
        narration: str | None = None,
    ) -> JournalEntry:
        postings: list[PostingLine] = []
        for line in lines:
            account = await self._account_by_id(line.account_id)
            if not account.is_active:
                raise ValidationError(f"Account {account.code} is inactive")
            postings.append(
                PostingLine(
                    account=account,
                    debit=line.debit,
                    credit=line.credit,
                    description=line.description,
                    party_type=line.party_type,
                    party_id=line.party_id,
                )
            )
        return await self._create_entry(
            voucher_type=voucher_type,
            entry_date=entry_date,
            lines=postings,
            reference=reference,
            narration=narration,
        )

    async def _create_entry(
        self,
        *,
        voucher_type: str,
        entry_date: date,
        lines: list[PostingLine],
        reference: str | None = None,
        narration: str | None = None,
        source_type: str | None = None,
        source_id: UUID | None = None,
        reversal_of_id: UUID | None = None,
        enforce_period_lock: bool = True,
    ) -> JournalEntry:
        if enforce_period_lock:
            closed = await self.repo.closed_period_for_date(entry_date)
            if closed is not None:
                raise ValidationError(f"Accounting period {closed.name} is closed")

        lines = [line for line in lines if line.debit or line.credit]
        if len(lines) < 2:
            raise ValidationError("A journal entry needs at least two postings")

        for line in lines:
            if line.account.is_group:
                raise ValidationError(
                    f"Account {line.account.code} is a group and cannot be posted to"
                )
            if line.debit < ZERO or line.credit < ZERO:
                raise ValidationError("Journal amounts cannot be negative")
            if line.debit and line.credit:
                raise ValidationError("A journal line must be either a debit or a credit, not both")

        total_debit = _q(sum((line.debit for line in lines), ZERO))
        total_credit = _q(sum((line.credit for line in lines), ZERO))
        if total_debit != total_credit:
            raise ValidationError(
                f"Journal entry is not balanced: debit {total_debit} != credit {total_credit}"
            )

        settings = await self._get_settings()
        entry = JournalEntry(
            tenant_id=self.tenant_id,
            entry_no=await self._next_entry_no(voucher_type, entry_date),
            entry_date=entry_date,
            voucher_type=voucher_type,
            reference=reference,
            narration=narration,
            source_type=source_type,
            source_id=source_id,
            status="posted",
            currency=settings.currency,
            reversal_of_id=reversal_of_id,
            created_by=self.user_id,
            posted_by=self.user_id,
            posted_at=_now(),
        )
        self.session.add(entry)
        await self.session.flush()

        for index, line in enumerate(lines, start=1):
            self.session.add(
                JournalLine(
                    tenant_id=self.tenant_id,
                    journal_entry_id=entry.id,
                    account_id=line.account.id,
                    line_no=index,
                    debit=_q(line.debit),
                    credit=_q(line.credit),
                    description=line.description,
                    party_type=line.party_type,
                    party_id=line.party_id,
                )
            )
        await self.session.flush()
        await record(
            self.session,
            self.tenant_id,
            entity_type="journal_entry",
            entity_id=entry.id,
            action="create",
            actor_id=self.user_id,
            after={
                "entry_no": entry.entry_no,
                "entry_date": entry.entry_date,
                "voucher_type": entry.voucher_type,
                "reference": entry.reference,
                "source_type": entry.source_type,
                "source_id": entry.source_id,
                "total_debit": total_debit,
                "total_credit": total_credit,
                "lines": [
                    {
                        "account": line.account.code,
                        "debit": line.debit,
                        "credit": line.credit,
                        "description": line.description,
                    }
                    for line in lines
                ],
            },
        )
        return entry

    async def _active_entry_for_source(
        self, source_type: str, source_id: UUID
    ) -> JournalEntry | None:
        return (
            (
                await self.session.execute(
                    select(JournalEntry).where(
                        JournalEntry.tenant_id == self.tenant_id,
                        JournalEntry.source_type == source_type,
                        JournalEntry.source_id == source_id,
                        JournalEntry.status != "void",
                    )
                )
            )
            .scalars()
            .first()
        )

    async def _active_entry_for(self, source_id: UUID) -> JournalEntry | None:
        return await self._active_entry_for_source("transaction", source_id)

    async def active_entry_for(self, transaction_id: UUID) -> JournalEntry | None:
        return await self._active_entry_for(transaction_id)

    async def active_entry_for_source(
        self, source_type: str, source_id: UUID
    ) -> JournalEntry | None:
        return await self._active_entry_for_source(source_type, source_id)

    async def _payment_account(self, tx: Transaction) -> Account:
        method = str((tx.metadata_ or {}).get("method") or "").lower()
        if method in BANK_METHODS:
            return await self._account(ACCOUNT_CODES["bank"])
        return await self._account(ACCOUNT_CODES["cash"])

    async def _resolve_cost(self, tx: Transaction) -> Decimal:
        meta = tx.metadata_ or {}
        if meta.get("cost_amount") is not None:
            return _q(meta["cost_amount"])

        order_id = meta.get("order_id")
        if order_id:
            try:
                parsed_order_id = UUID(str(order_id))
            except ValueError:
                parsed_order_id = None
            if parsed_order_id is not None:
                rows = (
                    await self.session.execute(
                        select(OrderItem.variant_id, OrderItem.quantity).where(
                            OrderItem.tenant_id == self.tenant_id,
                            OrderItem.order_id == parsed_order_id,
                        )
                    )
                ).all()
                total = ZERO
                for variant_id, quantity in rows:
                    if variant_id is None or not quantity:
                        continue
                    cost = await self._variant_cost(variant_id)
                    if cost is not None:
                        total += cost * Decimal(quantity)
                return _q(total)

        if tx.product_id is not None and tx.quantity:
            variant_ids = (
                (
                    await self.session.execute(
                        select(ProductVariant.id).where(
                            ProductVariant.tenant_id == self.tenant_id,
                            ProductVariant.product_id == tx.product_id,
                        )
                    )
                )
                .scalars()
                .all()
            )
            if len(variant_ids) == 1:
                cost = await self._variant_cost(variant_ids[0])
                if cost is not None:
                    return _q(cost * Decimal(tx.quantity))
        return ZERO

    async def _variant_cost(self, variant_id: UUID) -> Decimal | None:
        variant = (
            await self.session.execute(
                select(ProductVariant).where(
                    ProductVariant.tenant_id == self.tenant_id,
                    ProductVariant.id == variant_id,
                )
            )
        ).scalar_one_or_none()
        if variant is None:
            return None
        average = Decimal(variant.average_cost or 0)
        if average > ZERO:
            return average
        return await self._latest_cost(variant_id)

    async def _latest_cost(self, variant_id: UUID) -> Decimal | None:
        price = (
            await self.session.execute(
                select(VariantPrice)
                .where(
                    VariantPrice.tenant_id == self.tenant_id,
                    VariantPrice.variant_id == variant_id,
                    VariantPrice.cost_price.is_not(None),
                )
                .order_by(
                    VariantPrice.effective_from.desc().nullslast(),
                    VariantPrice.created_at.desc(),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if price is None or price.cost_price is None:
            return None
        return Decimal(price.cost_price)

    async def _transaction_variant(
        self, tx: Transaction
    ) -> tuple[ProductVariant, str] | None:
        if tx.product_id is None or not tx.quantity:
            return None
        quantity = Decimal(tx.quantity)
        if quantity <= 0 or quantity != quantity.to_integral_value():
            return None

        meta = tx.metadata_ or {}
        raw_variant_id = meta.get("variant_id")
        if raw_variant_id:
            try:
                variant_id = UUID(str(raw_variant_id))
            except ValueError:
                return None
            variant = (
                await self.session.execute(
                    select(ProductVariant).where(
                        ProductVariant.tenant_id == self.tenant_id,
                        ProductVariant.id == variant_id,
                        ProductVariant.product_id == tx.product_id,
                    )
                )
            ).scalar_one_or_none()
        else:
            variants = (
                (
                    await self.session.execute(
                        select(ProductVariant).where(
                            ProductVariant.tenant_id == self.tenant_id,
                            ProductVariant.product_id == tx.product_id,
                        )
                    )
                )
                .scalars()
                .all()
            )
            variant = variants[0] if len(variants) == 1 else None
        if variant is None:
            return None

        product_name = (
            await self.session.execute(
                select(Product.name).where(
                    Product.tenant_id == self.tenant_id,
                    Product.id == tx.product_id,
                )
            )
        ).scalar_one_or_none()
        if product_name is None:
            return None
        return variant, product_name

    async def _receive_purchase_stock(self, tx: Transaction, net: Decimal) -> None:
        resolved = await self._transaction_variant(tx)
        if resolved is None:
            return
        variant, product_name = resolved
        quantity = int(Decimal(tx.quantity))
        unit_cost = (Decimal(net) / quantity).quantize(Decimal("0.0001"))
        from app.modules.products.stock import StockChange, apply_stock_changes

        await apply_stock_changes(
            self.session,
            self.tenant_id,
            [
                StockChange(
                    variant_id=variant.id,
                    product_id=tx.product_id,
                    product_name=product_name,
                    variant_name=variant.name,
                    delta=quantity,
                    unit_cost=unit_cost,
                )
            ],
            reason="purchase",
            transaction_id=tx.id,
        )

    async def _issue_sale_stock(self, tx: Transaction, cost: Decimal) -> None:
        meta = tx.metadata_ or {}
        if meta.get("order_id") or meta.get("delivery_id"):
            return
        resolved = await self._transaction_variant(tx)
        if resolved is None:
            return
        variant, product_name = resolved
        quantity = int(Decimal(tx.quantity))
        if cost > ZERO:
            unit_cost = (Decimal(cost) / quantity).quantize(Decimal("0.0001"))
        else:
            unit_cost = Decimal(variant.average_cost or 0)
        from app.modules.products.stock import StockChange, apply_stock_changes

        try:
            await apply_stock_changes(
                self.session,
                self.tenant_id,
                [
                    StockChange(
                        variant_id=variant.id,
                        product_id=tx.product_id,
                        product_name=product_name,
                        variant_name=variant.name,
                        delta=-quantity,
                        unit_cost=unit_cost,
                    )
                ],
                reason="sale",
                transaction_id=tx.id,
            )
        except ConflictError:
            logging.getLogger("factory.accounting").warning(
                "Sale %s has no stock to issue; GL posted without a stock movement",
                tx.id,
            )

    async def _reverse_transaction_stock(self, transaction_id: UUID) -> None:
        movements = (
            (
                await self.session.execute(
                    select(InventoryMovement).where(
                        InventoryMovement.tenant_id == self.tenant_id,
                        InventoryMovement.transaction_id == transaction_id,
                        InventoryMovement.reason.in_(("purchase", "sale")),
                    )
                )
            )
            .scalars()
            .all()
        )
        if not movements:
            return
        from app.modules.products.stock import StockChange, apply_stock_changes

        try:
            await apply_stock_changes(
                self.session,
                self.tenant_id,
                [
                    StockChange(
                        variant_id=movement.variant_id,
                        product_id=movement.product_id,
                        product_name=movement.product_name,
                        variant_name=movement.variant_name,
                        delta=-movement.quantity,
                        unit_cost=Decimal(movement.unit_cost or 0),
                    )
                    for movement in movements
                ],
                reason="transaction_void",
            )
        except ConflictError:
            logging.getLogger("factory.accounting").warning(
                "Could not reverse stock for transaction %s", transaction_id
            )
            return
        await self.session.execute(
            update(InventoryMovement)
            .where(
                InventoryMovement.tenant_id == self.tenant_id,
                InventoryMovement.id.in_([movement.id for movement in movements]),
            )
            .values(transaction_id=None)
        )

    async def _post_sale(self, tx: Transaction) -> JournalEntry | None:
        amount = _q(tx.amount)
        tax = _q(tx.tax_amount or 0)
        tds = _q(tx.tds_amount or 0)
        if amount <= ZERO or tax + tds > amount:
            return None
        net = _q(amount - tax)

        receivable = await self._account(ACCOUNT_CODES["receivable"])
        sales = await self._account(ACCOUNT_CODES["sales"])

        lines = [
            PostingLine(
                receivable,
                debit=_q(amount - tds),
                description=tx.description,
                party_type="customer",
                party_id=tx.customer_id,
            ),
            PostingLine(sales, credit=net, description=tx.description),
        ]
        if tax > 0:
            vat_output = await self._account(ACCOUNT_CODES["vat_output"])
            lines.append(PostingLine(vat_output, credit=tax, description="Output VAT"))
        if tds > 0:
            tds_receivable = await self._account(
                ACCOUNT_CODES["tds_receivable"]
            )
            lines.append(
                PostingLine(
                    tds_receivable,
                    debit=tds,
                    description="TDS withheld by customer",
                    party_type="customer",
                    party_id=tx.customer_id,
                )
            )

        cost = await self._resolve_cost(tx)
        if cost > 0:
            cogs = await self._account(ACCOUNT_CODES["cogs"])
            inventory = await self._account(ACCOUNT_CODES["inventory"])
            lines.append(PostingLine(cogs, debit=cost, description="Cost of goods sold"))
            lines.append(PostingLine(inventory, credit=cost, description="Cost of goods sold"))

        entry = await self._create_entry(
            voucher_type="sales",
            entry_date=tx.transaction_date.date(),
            lines=lines,
            reference=tx.external_id,
            narration=tx.description,
            source_type="transaction",
            source_id=tx.id,
        )
        await self._issue_sale_stock(tx, cost)
        return entry

    async def _post_purchase(self, tx: Transaction) -> JournalEntry | None:
        amount = _q(tx.amount)
        tax = _q(tx.tax_amount or 0)
        tds = _q(tx.tds_amount or 0)
        if amount <= ZERO or tax + tds > amount:
            return None
        net = _q(amount - tax)

        inventory = await self._account(ACCOUNT_CODES["inventory"])
        payment = await self._payment_account(tx)

        lines = [PostingLine(inventory, debit=net, description=tx.description)]
        if tax > 0:
            vat_input = await self._account(ACCOUNT_CODES["vat_input"])
            lines.append(PostingLine(vat_input, debit=tax, description="Input VAT"))
        if tds > 0:
            tds_payable = await self._account(ACCOUNT_CODES["tds_payable"])
            lines.append(
                PostingLine(
                    tds_payable,
                    credit=tds,
                    description="TDS withheld from supplier",
                )
            )
        lines.append(
            PostingLine(payment, credit=_q(amount - tds), description=tx.description)
        )

        entry = await self._create_entry(
            voucher_type="purchase",
            entry_date=tx.transaction_date.date(),
            lines=lines,
            reference=tx.external_id,
            narration=tx.description,
            source_type="transaction",
            source_id=tx.id,
        )
        await self._receive_purchase_stock(tx, net)
        return entry

    async def _post_expense(self, tx: Transaction) -> JournalEntry | None:
        amount = _q(tx.amount)
        tax = _q(tx.tax_amount or 0)
        tds = _q(tx.tds_amount or 0)
        if amount <= ZERO or tax + tds > amount:
            return None
        net = _q(amount - tax)

        expense_code = ACCOUNT_CODES["expense_default"]
        meta = tx.metadata_ or {}
        requested = meta.get("account_code")
        if requested:
            candidate = await self._account_optional(str(requested))
            if (
                candidate is not None
                and not candidate.is_group
                and candidate.account_type == "expense"
            ):
                expense_code = str(requested)
        expense = await self._account(expense_code)
        payment = await self._payment_account(tx)

        lines = [PostingLine(expense, debit=net, description=tx.description)]
        if tax > 0:
            vat_input = await self._account(ACCOUNT_CODES["vat_input"])
            lines.append(PostingLine(vat_input, debit=tax, description="Input VAT"))
        if tds > 0:
            tds_payable = await self._account(ACCOUNT_CODES["tds_payable"])
            lines.append(
                PostingLine(
                    tds_payable,
                    credit=tds,
                    description="TDS withheld",
                )
            )
        lines.append(
            PostingLine(payment, credit=_q(amount - tds), description=tx.description)
        )

        return await self._create_entry(
            voucher_type="expense",
            entry_date=tx.transaction_date.date(),
            lines=lines,
            reference=tx.external_id,
            narration=tx.description,
            source_type="transaction",
            source_id=tx.id,
        )

    async def _post_receipt(self, tx: Transaction) -> JournalEntry | None:
        amount = _q(tx.amount)
        if amount <= ZERO:
            return None
        payment = await self._payment_account(tx)
        receivable = await self._account(ACCOUNT_CODES["receivable"])

        lines = [
            PostingLine(payment, debit=amount, description=tx.description),
            PostingLine(
                receivable,
                credit=amount,
                description=tx.description,
                party_type="customer",
                party_id=tx.customer_id,
            ),
        ]
        return await self._create_entry(
            voucher_type="receipt",
            entry_date=tx.transaction_date.date(),
            lines=lines,
            reference=tx.external_id,
            narration=tx.description,
            source_type="transaction",
            source_id=tx.id,
        )

    async def _post_reversal(self, tx: Transaction) -> JournalEntry | None:
        original = await self._active_entry_for(tx.reverses_id)
        if original is None:
            return None

        original_lines = (
            (
                await self.session.execute(
                    select(JournalLine)
                    .where(
                        JournalLine.tenant_id == self.tenant_id,
                        JournalLine.journal_entry_id == original.id,
                    )
                    .order_by(JournalLine.line_no)
                )
            )
            .scalars()
            .all()
        )

        reversed_lines = [
            PostingLine(
                account=await self._account_by_id(line.account_id),
                debit=line.credit,
                credit=line.debit,
                description=line.description,
                party_type=line.party_type,
                party_id=line.party_id,
            )
            for line in original_lines
        ]

        return await self._create_entry(
            voucher_type="reversal",
            entry_date=tx.transaction_date.date(),
            lines=reversed_lines,
            reference=original.entry_no,
            narration=tx.description or f"Reversal of {original.entry_no}",
            source_type="transaction",
            source_id=tx.id,
            reversal_of_id=original.id,
        )

    async def post_transaction(self, tx: Transaction) -> JournalEntry | None:
        existing = await self._active_entry_for(tx.id)
        if existing is not None:
            return existing

        if tx.reverses_id is not None:
            return await self._post_reversal(tx)

        handler = {
            "sale": self._post_sale,
            "purchase": self._post_purchase,
            "expense": self._post_expense,
            "receipt": self._post_receipt,
        }.get(tx.type)
        if handler is None:
            return None
        return await handler(tx)

    async def void_entry(
        self,
        entry_id: UUID,
        *,
        reason: str | None = None,
        enforce_period_lock: bool = True,
    ) -> JournalEntry | None:
        entry = (
            await self.session.execute(
                select(JournalEntry).where(
                    JournalEntry.tenant_id == self.tenant_id,
                    JournalEntry.id == entry_id,
                )
            )
        ).scalar_one_or_none()
        if entry is None or entry.status == "void":
            return entry

        if enforce_period_lock:
            closed = await self.repo.closed_period_for_date(entry.entry_date)
            if closed is not None:
                raise ValidationError(f"Accounting period {closed.name} is closed")

        before = {"status": entry.status}
        await self.session.execute(
            update(JournalEntry)
            .where(JournalEntry.id == entry.id)
            .values(status="void", updated_at=_now())
        )
        await record(
            self.session,
            self.tenant_id,
            entity_type="journal_entry",
            entity_id=entry.id,
            action="void",
            actor_id=self.user_id,
            before=before,
            after={"status": "void"},
            reason=reason,
        )
        return entry

    async def void_for_transaction(self, transaction_id: UUID) -> None:
        entry = await self._active_entry_for(transaction_id)
        if entry is not None:
            await self.void_entry(entry.id, reason="Source transaction voided")
            await self._reverse_transaction_stock(transaction_id)

    async def repost_transaction(self, tx: Transaction) -> JournalEntry | None:
        await self.void_for_transaction(tx.id)
        return await self.post_transaction(tx)

    async def post_closing_entry(
        self, period, *, entry_date: date | None = None
    ) -> JournalEntry | None:
        existing = await self._active_entry_for_source("period_close", period.id)
        if existing is not None:
            return existing

        movements = await self.repo.gl_account_balances(
            date_from=period.start_date, date_to=period.end_date
        )
        lines: list[PostingLine] = []
        net = ZERO
        for movement in movements:
            if movement.is_group or movement.account_type not in {
                "income",
                "expense",
            }:
                continue
            if movement.account_type == "income":
                amount = _q(movement.credit - movement.debit)
                net = _q(net + amount)
                if amount > ZERO:
                    lines.append(
                        PostingLine(
                            await self._account_by_id(movement.account_id),
                            debit=amount,
                            description="Close income account",
                        )
                    )
                elif amount < ZERO:
                    lines.append(
                        PostingLine(
                            await self._account_by_id(movement.account_id),
                            credit=-amount,
                            description="Close income account",
                        )
                    )
            else:
                amount = _q(movement.debit - movement.credit)
                net = _q(net - amount)
                if amount > ZERO:
                    lines.append(
                        PostingLine(
                            await self._account_by_id(movement.account_id),
                            credit=amount,
                            description="Close expense account",
                        )
                    )
                elif amount < ZERO:
                    lines.append(
                        PostingLine(
                            await self._account_by_id(movement.account_id),
                            debit=-amount,
                            description="Close expense account",
                        )
                    )

        if not lines:
            return None

        retained = await self._account(ACCOUNT_CODES["retained_earnings"])
        if net > ZERO:
            lines.append(PostingLine(retained, credit=net, description="Net profit for the period"))
        elif net < ZERO:
            lines.append(PostingLine(retained, debit=-net, description="Net loss for the period"))

        return await self._create_entry(
            voucher_type="closing",
            entry_date=entry_date or period.end_date,
            lines=lines,
            reference=period.name,
            narration=f"Close accounting period {period.name}",
            source_type="period_close",
            source_id=period.id,
            enforce_period_lock=False,
        )

    async def void_closing_entry(
        self, period_id: UUID, *, reason: str | None = None
    ) -> JournalEntry | None:
        entry = await self._active_entry_for_source("period_close", period_id)
        if entry is None:
            return None
        return await self.void_entry(entry.id, reason=reason, enforce_period_lock=False)

    async def post_opening_balances(
        self,
        settings: AccountingSettings,
        *,
        entry_date: date | None = None,
        repost: bool = False,
    ) -> JournalEntry | None:
        existing = await self._active_entry_for_source("opening_balance", settings.id)
        if existing is not None:
            if not repost:
                return existing
            await self.void_entry(existing.id, reason="Opening balances reposted")

        debits = [
            ("cash", _q(settings.opening_cash)),
            ("receivable", _q(settings.opening_receivables)),
            ("inventory", _q(settings.opening_inventory)),
            ("other_assets", _q(settings.opening_other_assets)),
        ]
        credits = [
            ("payable", _q(settings.opening_payables)),
            ("loans", _q(settings.opening_loans)),
            ("capital", _q(settings.opening_capital)),
        ]
        if not any(value > ZERO for _, value in debits + credits):
            return None

        lines: list[PostingLine] = []
        for key, value in debits:
            if value > ZERO:
                lines.append(
                    PostingLine(
                        await self._account(ACCOUNT_CODES[key]),
                        debit=value,
                        description="Opening balance",
                    )
                )
        for key, value in credits:
            if value > ZERO:
                lines.append(
                    PostingLine(
                        await self._account(ACCOUNT_CODES[key]),
                        credit=value,
                        description="Opening balance",
                    )
                )

        total_debit = _q(sum((line.debit for line in lines), ZERO))
        total_credit = _q(sum((line.credit for line in lines), ZERO))
        plug = _q(total_debit - total_credit)
        if plug:
            equity = await self._account(ACCOUNT_CODES["opening_equity"])
            if plug > ZERO:
                lines.append(PostingLine(equity, credit=plug, description="Opening balance equity"))
            else:
                lines.append(PostingLine(equity, debit=-plug, description="Opening balance equity"))

        if entry_date is None and settings.book_start_date is None:
            entry_date = await self.repo.earliest_transaction_date()

        return await self._create_entry(
            voucher_type="opening",
            entry_date=entry_date or settings.book_start_date or date.today(),
            lines=lines,
            reference="OPENING",
            narration="Opening balances",
            source_type="opening_balance",
            source_id=settings.id,
        )
