"""Accounting statement engine.

Four statements are derived from the existing single-entry ledger plus orders
and inventory — no new double-entry book is maintained:

- **Trial Balance** (as-of): lists each account with its net debit/credit so the
  books can be proven to balance.
- **Profit & Loss** (period): revenue from ``sale`` transactions, COGS on a
  cost-price basis (falling back to purchases), opex from ``expense`` rows.
- **Balance Sheet** (as-of, cash basis): assets/liabilities/equity built from
  ledger cash, open receivables, inventory at cost, and the tenant's configured
  opening balances; retained earnings carries the running profit so it balances.
- **Cash Flow** (period): receipts in, expenses/purchases out, split into
  operating / investing / financing by transaction description heuristics.

Revenue is recognised when an order is delivered (the ``sale`` row), matching
``app.modules.finance``. Receipts never recognise revenue — they only move cash.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting import schemas
from app.modules.accounting.models import AccountingSettings
from app.modules.accounting.repository import AccountingRepository

ZERO = Decimal("0.00")
HUNDRED = Decimal("100")


def _q(value: Decimal) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.01"))


def _signed(amount: Decimal, reverses_id: object | None) -> Decimal:
    return Decimal(amount) * (Decimal("-1") if reverses_id else Decimal("1"))


class AccountingService:
    def __init__(self, session: AsyncSession, tenant_id: UUID) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = AccountingRepository(session, tenant_id)

    # ---- settings ------------------------------------------------------------

    async def get_settings(self) -> AccountingSettings:
        return await self.repo.ensure_settings()

    async def update_settings(
        self, data: schemas.AccountingSettingsUpdate
    ) -> AccountingSettings:
        settings = await self.repo.ensure_settings()
        payload = data.model_dump(exclude_unset=True)
        for key, value in payload.items():
            if value is not None:
                setattr(settings, key, value)
        await self.session.flush()
        return settings

    # ---- trial balance -------------------------------------------------------

    async def trial_balance(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        customer_id: UUID | None = None,
        min_amount: Decimal | None = None,
        max_amount: Decimal | None = None,
    ) -> schemas.TrialBalanceResponse:
        rows = await self.repo.transactions(
            date_from=date_from,
            date_to=date_to,
            customer_id=customer_id,
            min_amount=min_amount,
            max_amount=max_amount,
        )
        settings = await self.repo.ensure_settings()

        # Double-entry postings derived from the single-entry ledger, so the
        # trial balance always proves.
        buckets: dict[str, dict[str, Decimal]] = {}

        def _post(
            account: str,
            code: str,
            kind: str,
            debit: Decimal = ZERO,
            credit: Decimal = ZERO,
        ) -> None:
            entry = buckets.setdefault(
                account, {"code": code, "type": kind, "debit": ZERO, "credit": ZERO}
            )
            entry["debit"] += debit
            entry["credit"] += credit

        for t in rows:
            amount = _signed(t.amount, t.reverses_id)
            if t.type == "receipt":
                _post("Cash & Bank", "1000", "asset", debit=amount)
                _post("Accounts Receivable", "1100", "asset", credit=amount)
            elif t.type == "sale":
                _post("Accounts Receivable", "1100", "asset", debit=amount)
                _post("Sales Revenue", "4000", "income", credit=amount)
            elif t.type == "purchase":
                _post("Inventory", "1200", "asset", debit=amount)
                _post("Cash & Bank", "1000", "asset", credit=amount)
            elif t.type == "expense":
                _post("Operating Expenses", "6000", "expense", debit=amount)
                _post("Cash & Bank", "1000", "asset", credit=amount)

        # Opening balances as a double-entry position.
        openings = [
            ("Cash & Bank", "1000", "asset", _q(settings.opening_cash), "debit"),
            ("Accounts Receivable", "1100", "asset", _q(settings.opening_receivables), "debit"),
            ("Inventory", "1200", "asset", _q(settings.opening_inventory), "debit"),
            ("Other Assets", "1300", "asset", _q(settings.opening_other_assets), "debit"),
            ("Accounts Payable", "2000", "liability", _q(settings.opening_payables), "credit"),
            ("Loans", "2100", "liability", _q(settings.opening_loans), "credit"),
            ("Owner's Capital", "3000", "equity", _q(settings.opening_capital), "credit"),
        ]
        for account, code, kind, amount, side in openings:
            if amount == ZERO:
                continue
            if side == "debit":
                _post(account, code, kind, debit=amount)
            else:
                _post(account, code, kind, credit=amount)

        result_rows: list[schemas.TrialBalanceRow] = []
        total_debit = ZERO
        total_credit = ZERO
        for account in sorted(buckets, key=lambda a: buckets[a]["code"]):
            b = buckets[account]
            debit = _q(b["debit"])
            credit = _q(b["credit"])
            net_debit = _q(debit - credit) if debit >= credit else ZERO
            net_credit = _q(credit - debit) if credit > debit else ZERO
            result_rows.append(
                schemas.TrialBalanceRow(
                    account=account,
                    code=b["code"],
                    account_type=b["type"],
                    debit=net_debit,
                    credit=net_credit,
                )
            )
            total_debit += net_debit
            total_credit += net_credit

        total_debit = _q(total_debit)
        total_credit = _q(total_credit)
        return schemas.TrialBalanceResponse(
            as_of=date_to,
            rows=result_rows,
            total_debit=total_debit,
            total_credit=total_credit,
            balanced=total_debit == total_credit,
        )

    # ---- profit & loss -------------------------------------------------------

    async def profit_and_loss(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        customer_id: UUID | None = None,
        min_amount: Decimal | None = None,
        max_amount: Decimal | None = None,
    ) -> schemas.ProfitLossResponse:
        rows = await self.repo.transactions(
            date_from=date_from,
            date_to=date_to,
            customer_id=customer_id,
            min_amount=min_amount,
            max_amount=max_amount,
        )

        revenue = ZERO
        expenses = ZERO
        for t in rows:
            amount = _signed(t.amount, t.reverses_id)
            if t.type == "sale":
                revenue += amount
            elif t.type == "expense":
                expenses += amount

        cogs, used_cost_price = await self.repo.cost_of_goods_sold(
            date_from=date_from, date_to=date_to
        )

        revenue = _q(revenue)
        cogs = _q(cogs)
        expenses = _q(expenses)
        gross_profit = _q(revenue - cogs)
        net_profit = _q(gross_profit - expenses)

        gross_margin = (
            _q(gross_profit / revenue * HUNDRED) if revenue else ZERO
        )
        net_margin = _q(net_profit / revenue * HUNDRED) if revenue else ZERO

        lines = [
            schemas.PLLine(label="Revenue (Sales)", amount=revenue, key="revenue"),
            schemas.PLLine(
                label="Cost of Goods Sold"
                + ("" if used_cost_price else " (from purchases)"),
                amount=cogs,
                key="cogs",
            ),
            schemas.PLLine(label="Gross Profit", amount=gross_profit, key="gross_profit"),
            schemas.PLLine(
                label="Operating Expenses", amount=expenses, key="operating_expenses"
            ),
            schemas.PLLine(label="Net Profit", amount=net_profit, key="net_profit"),
        ]
        return schemas.ProfitLossResponse(
            date_from=date_from,
            date_to=date_to,
            revenue=revenue,
            cogs=cogs,
            gross_profit=gross_profit,
            operating_expenses=expenses,
            net_profit=net_profit,
            gross_margin_pct=gross_margin,
            net_margin_pct=net_margin,
            cogs_basis="cost_price" if used_cost_price else "purchases",
            lines=lines,
        )

    # ---- balance sheet -------------------------------------------------------

    async def balance_sheet(
        self, *, as_of: date | None = None
    ) -> schemas.BalanceSheetResponse:
        settings = await self.repo.ensure_settings()

        cash = _q(await self.repo.cash_balance(as_of))
        receivables = _q(await self.repo.open_receivables(as_of))

        # Inventory left on hand = purchases made − cost of what was sold.
        purchases = _q(await self.repo.purchases_total(as_of))
        pl = await self.profit_and_loss(date_to=as_of)
        inventory_ledger = _q(purchases - pl.cogs)
        inventory_live = await self.repo.inventory_value()
        # Prefer the live stock valuation when available, else the ledger
        # residual. Either way it is an asset line, not a plug.
        inventory = inventory_live if inventory_live > ZERO else inventory_ledger

        retained = _q(pl.net_profit)

        opening_cash = _q(settings.opening_cash)
        opening_ar = _q(settings.opening_receivables)
        opening_inv = _q(settings.opening_inventory)
        opening_other = _q(settings.opening_other_assets)
        opening_payables = _q(settings.opening_payables)
        opening_loans = _q(settings.opening_loans)
        opening_capital = _q(settings.opening_capital)

        assets = [
            schemas.BalanceSheetLine(label="Cash & Bank", amount=_q(opening_cash + cash)),
            schemas.BalanceSheetLine(
                label="Accounts Receivable", amount=_q(opening_ar + receivables)
            ),
            schemas.BalanceSheetLine(
                label="Inventory", amount=_q(opening_inv + inventory)
            ),
            schemas.BalanceSheetLine(label="Other Assets", amount=opening_other),
        ]
        liabilities = [
            schemas.BalanceSheetLine(label="Accounts Payable", amount=opening_payables),
            schemas.BalanceSheetLine(label="Loans", amount=opening_loans),
        ]
        equity = [
            schemas.BalanceSheetLine(label="Owner's Capital", amount=opening_capital),
            schemas.BalanceSheetLine(label="Retained Earnings", amount=retained),
        ]

        total_assets = _q(sum((line.amount for line in assets), ZERO))
        total_liabilities = _q(sum((line.amount for line in liabilities), ZERO))
        total_equity = _q(sum((line.amount for line in equity), ZERO))
        difference = _q(total_assets - total_liabilities - total_equity)

        return schemas.BalanceSheetResponse(
            as_of=as_of,
            assets=assets,
            liabilities=liabilities,
            equity=equity,
            total_assets=total_assets,
            total_liabilities=total_liabilities,
            total_equity=total_equity,
            balanced=difference == ZERO,
            retained_earnings=retained,
            difference=difference,
        )

    # ---- cash flow -----------------------------------------------------------

    async def cash_flow(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        customer_id: UUID | None = None,
        min_amount: Decimal | None = None,
        max_amount: Decimal | None = None,
    ) -> schemas.CashFlowResponse:
        settings = await self.repo.ensure_settings()
        rows = await self.repo.transactions(
            date_from=date_from,
            date_to=date_to,
            customer_id=customer_id,
            min_amount=min_amount,
            max_amount=max_amount,
        )

        # Opening cash for the period.
        if date_from is not None:
            opening_cash = _q(
                _q(settings.opening_cash) + await self.repo.cash_balance(date_from)
            )
        else:
            opening_cash = _q(settings.opening_cash)

        operating_in = ZERO
        operating_out = ZERO
        investing: list[schemas.CashFlowLine] = []
        financing: list[schemas.CashFlowLine] = []
        net_investing = ZERO
        net_financing = ZERO

        for t in rows:
            amount = _signed(t.amount, t.reverses_id)
            blob = (t.description or "").lower()
            if t.type == "receipt":
                operating_in += amount
            elif t.type == "expense":
                if any(k in blob for k in ("asset", "equipment", "machine", "vehicle")):
                    line = schemas.CashFlowLine(
                        label=t.description or "Asset purchase", amount=-amount
                    )
                    investing.append(line)
                    net_investing -= amount
                elif any(k in blob for k in ("loan", "capital", "drawing", "dividend")):
                    line = schemas.CashFlowLine(
                        label=t.description or "Financing", amount=-amount
                    )
                    financing.append(line)
                    net_financing -= amount
                else:
                    operating_out += amount
            elif t.type == "purchase":
                operating_out += amount

        net_operating = _q(operating_in - operating_out)
        operating = [
            schemas.CashFlowLine(
                label="Cash collected from customers", amount=_q(operating_in)
            ),
            schemas.CashFlowLine(
                label="Payments to suppliers & expenses", amount=-_q(operating_out)
            ),
            schemas.CashFlowLine(
                label="Net cash from operating activities", amount=net_operating
            ),
        ]

        net_change = _q(net_operating + net_investing + net_financing)
        closing_cash = _q(opening_cash + net_change)

        return schemas.CashFlowResponse(
            date_from=date_from,
            date_to=date_to,
            operating=operating,
            investing=investing,
            financing=financing,
            net_operating=net_operating,
            net_investing=_q(net_investing),
            net_financing=_q(net_financing),
            opening_cash=opening_cash,
            net_change=net_change,
            closing_cash=closing_cash,
        )
