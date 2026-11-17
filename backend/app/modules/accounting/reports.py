"""Reports built directly from the double-entry journal.

Unlike :mod:`app.modules.accounting.service` (which derives statements from the
legacy single-entry ledger), every figure here comes from ``journal_lines``.
The two engines run side by side so a tenant can reconcile them before
switching the UI over.

Sign convention: each line is reported on its account's normal balance side.
A debit-normal account is positive when debits exceed credits; a credit-normal
account is positive when credits exceed debits.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from app.modules.accounting import schemas
from app.modules.accounting.repository import (
    AccountingRepository,
    AccountMovement,
    LedgerLine,
)
from app.shared.exceptions import NotFoundError

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
CASH_CODES = {"1010", "1020"}
RECEIVABLE_CODE = "1030"
VAT_INPUT_CODE = "1070"
VAT_OUTPUT_CODE = "2030"
TDS_RECEIVABLE_CODE = "1085"
TDS_PAYABLE_CODE = "2040"


def _q(value: Decimal | int | str | None) -> Decimal:
    return Decimal(value or 0).quantize(CENT)


def _movement_amount(movement: AccountMovement) -> Decimal:
    if movement.normal_balance == "credit":
        return _q(movement.credit - movement.debit)
    return _q(movement.debit - movement.credit)


def _line_amount(line: LedgerLine) -> Decimal:
    if line.normal_balance == "credit":
        return _q(line.credit - line.debit)
    return _q(line.debit - line.credit)


def _split_balance(net: Decimal) -> tuple[Decimal, Decimal]:
    """Return (debit, credit) for a signed net balance."""
    net = _q(net)
    return (net, ZERO) if net >= ZERO else (ZERO, -net)


class GLReportService:
    def __init__(self, session, tenant_id: UUID) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = AccountingRepository(session, tenant_id)

    async def _account_map(self):
        return {account.id: account for account in await self.repo.accounts()}

    # ---- trial balance -------------------------------------------------------

    async def trial_balance(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> schemas.GLTrialBalanceResponse:
        accounts = await self._account_map()
        opening = {}
        if date_from is not None:
            opening = {
                movement.account_id: movement
                for movement in await self.repo.gl_account_balances(
                    date_to=date_from - timedelta(days=1)
                )
            }
        period = {
            movement.account_id: movement
            for movement in await self.repo.gl_account_balances(
                date_from=date_from, date_to=date_to
            )
        }

        rows: list[schemas.GLTrialBalanceRow] = []
        totals = {
            "opening_debit": ZERO,
            "opening_credit": ZERO,
            "period_debit": ZERO,
            "period_credit": ZERO,
            "closing_debit": ZERO,
            "closing_credit": ZERO,
        }
        for account_id in sorted(set(opening) | set(period), key=lambda aid: accounts[aid].code):
            account = accounts[account_id]
            opening_movement = opening.get(account_id)
            period_movement = period.get(account_id)

            opening_net = _q(
                (opening_movement.debit - opening_movement.credit) if opening_movement else ZERO
            )
            period_debit = _q(period_movement.debit if period_movement else ZERO)
            period_credit = _q(period_movement.credit if period_movement else ZERO)
            closing_net = _q(opening_net + period_debit - period_credit)

            opening_debit, opening_credit = _split_balance(opening_net)
            closing_debit, closing_credit = _split_balance(closing_net)

            rows.append(
                schemas.GLTrialBalanceRow(
                    account_id=account.id,
                    code=account.code,
                    name=account.name,
                    account_type=account.account_type,
                    normal_balance=account.normal_balance,
                    opening_debit=opening_debit,
                    opening_credit=opening_credit,
                    period_debit=period_debit,
                    period_credit=period_credit,
                    closing_debit=closing_debit,
                    closing_credit=closing_credit,
                )
            )
            totals["opening_debit"] += opening_debit
            totals["opening_credit"] += opening_credit
            totals["period_debit"] += period_debit
            totals["period_credit"] += period_credit
            totals["closing_debit"] += closing_debit
            totals["closing_credit"] += closing_credit

        for key, value in totals.items():
            totals[key] = _q(value)

        return schemas.GLTrialBalanceResponse(
            date_from=date_from,
            date_to=date_to,
            rows=rows,
            total_opening_debit=totals["opening_debit"],
            total_opening_credit=totals["opening_credit"],
            total_period_debit=totals["period_debit"],
            total_period_credit=totals["period_credit"],
            total_closing_debit=totals["closing_debit"],
            total_closing_credit=totals["closing_credit"],
            balanced=totals["closing_debit"] == totals["closing_credit"],
        )

    # ---- profit & loss -------------------------------------------------------

    async def profit_and_loss(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> schemas.GLProfitLossResponse:
        movements = await self.repo.gl_account_balances(
            date_from=date_from,
            date_to=date_to,
            exclude_voucher_types=["closing"],
        )
        income: list[schemas.GLReportLine] = []
        expenses: list[schemas.GLReportLine] = []
        for movement in movements:
            if movement.is_group:
                continue
            if movement.account_type == "income":
                amount = _q(movement.credit - movement.debit)
                if amount:
                    income.append(
                        schemas.GLReportLine(
                            account_id=movement.account_id,
                            code=movement.code,
                            name=movement.name,
                            amount=amount,
                        )
                    )
            elif movement.account_type == "expense":
                amount = _q(movement.debit - movement.credit)
                if amount:
                    expenses.append(
                        schemas.GLReportLine(
                            account_id=movement.account_id,
                            code=movement.code,
                            name=movement.name,
                            amount=amount,
                        )
                    )

        income.sort(key=lambda line: line.code or "")
        expenses.sort(key=lambda line: line.code or "")
        total_income = _q(sum((line.amount for line in income), ZERO))
        total_expenses = _q(sum((line.amount for line in expenses), ZERO))
        cogs = _q(
            sum(
                (line.amount for line in expenses if line.code and line.code.startswith("50")),
                ZERO,
            )
        )
        gross_profit = _q(total_income - cogs)
        operating_expenses = _q(total_expenses - cogs)
        net_profit = _q(total_income - total_expenses)

        return schemas.GLProfitLossResponse(
            date_from=date_from,
            date_to=date_to,
            income=income,
            expenses=expenses,
            total_income=total_income,
            cogs=cogs,
            gross_profit=gross_profit,
            operating_expenses=operating_expenses,
            total_expenses=total_expenses,
            net_profit=net_profit,
        )

    # ---- balance sheet -------------------------------------------------------

    async def balance_sheet(self, *, as_of: date | None = None) -> schemas.GLBalanceSheetResponse:
        movements = await self.repo.gl_account_balances(date_to=as_of)
        assets: list[schemas.GLReportLine] = []
        liabilities: list[schemas.GLReportLine] = []
        equity: list[schemas.GLReportLine] = []
        income_total = ZERO
        expense_total = ZERO

        for movement in movements:
            if movement.is_group:
                continue
            if movement.account_type == "asset":
                amount = _q(movement.debit - movement.credit)
                target = assets
            elif movement.account_type == "liability":
                amount = _q(movement.credit - movement.debit)
                target = liabilities
            elif movement.account_type == "equity":
                amount = _q(movement.credit - movement.debit)
                target = equity
            elif movement.account_type == "income":
                income_total += movement.credit - movement.debit
                continue
            elif movement.account_type == "expense":
                expense_total += movement.debit - movement.credit
                continue
            else:
                continue
            if amount:
                target.append(
                    schemas.GLReportLine(
                        account_id=movement.account_id,
                        code=movement.code,
                        name=movement.name,
                        amount=amount,
                    )
                )

        assets.sort(key=lambda line: line.code or "")
        liabilities.sort(key=lambda line: line.code or "")
        equity.sort(key=lambda line: line.code or "")

        current_earnings = _q(income_total - expense_total)
        if current_earnings:
            equity.append(
                schemas.GLReportLine(
                    name="Current Year Earnings (unclosed)",
                    amount=current_earnings,
                )
            )

        total_assets = _q(sum((line.amount for line in assets), ZERO))
        total_liabilities = _q(sum((line.amount for line in liabilities), ZERO))
        total_equity = _q(sum((line.amount for line in equity), ZERO))
        difference = _q(total_assets - total_liabilities - total_equity)

        return schemas.GLBalanceSheetResponse(
            as_of=as_of,
            assets=assets,
            liabilities=liabilities,
            equity=equity,
            total_assets=total_assets,
            total_liabilities=total_liabilities,
            total_equity=total_equity,
            current_earnings=current_earnings,
            difference=difference,
            balanced=abs(difference) <= CENT,
        )

    # ---- cash flow -----------------------------------------------------------

    async def cash_flow(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> schemas.GLCashFlowResponse:
        accounts = await self._account_map()
        entries = await self.repo.gl_entries_with_lines(
            date_from=date_from,
            date_to=date_to,
            account_codes=CASH_CODES,
        )

        def cash_net(entry) -> Decimal:
            return _q(
                sum(
                    (
                        line.debit - line.credit
                        for line in entry.lines
                        if accounts[line.account_id].code in CASH_CODES
                    ),
                    ZERO,
                )
            )

        opening_cash = ZERO
        if date_from is not None:
            prior = await self.repo.gl_account_balances(date_to=date_from - timedelta(days=1))
            opening_cash = _q(
                sum(
                    (
                        movement.debit - movement.credit
                        for movement in prior
                        if movement.code in CASH_CODES
                    ),
                    ZERO,
                )
            )

        groups: dict[str, dict[str, Decimal]] = {
            "operating": {},
            "investing": {},
            "financing": {},
        }
        for entry in entries:
            if entry.voucher_type == "opening":
                opening_cash = _q(opening_cash + cash_net(entry))
                continue

            net = cash_net(entry)
            if net == ZERO:
                continue

            non_cash = [
                line for line in entry.lines if accounts[line.account_id].code not in CASH_CODES
            ]
            codes = [accounts[line.account_id].code for line in non_cash]
            if any(code.startswith(("12", "13")) for code in codes):
                category = "investing"
            elif any(
                accounts[line.account_id].account_type in {"liability", "equity"}
                for line in non_cash
            ):
                category = "financing"
            else:
                category = "operating"

            for line in non_cash:
                account = accounts[line.account_id]
                flow = _q(line.credit - line.debit)
                if flow:
                    groups[category][account.name] = _q(
                        groups[category].get(account.name, ZERO) + flow
                    )

        def lines_for(category: str) -> list[schemas.GLCashFlowLine]:
            return [
                schemas.GLCashFlowLine(label=label, amount=amount)
                for label, amount in sorted(groups[category].items())
            ]

        operating = lines_for("operating")
        investing = lines_for("investing")
        financing = lines_for("financing")
        net_operating = _q(sum((line.amount for line in operating), ZERO))
        net_investing = _q(sum((line.amount for line in investing), ZERO))
        net_financing = _q(sum((line.amount for line in financing), ZERO))
        net_change = _q(net_operating + net_investing + net_financing)
        closing_cash = _q(opening_cash + net_change)

        movements = await self.repo.gl_account_balances(date_to=date_to)
        gl_cash = _q(
            sum(
                (
                    movement.debit - movement.credit
                    for movement in movements
                    if movement.code in CASH_CODES
                ),
                ZERO,
            )
        )

        return schemas.GLCashFlowResponse(
            date_from=date_from,
            date_to=date_to,
            operating=operating,
            investing=investing,
            financing=financing,
            net_operating=net_operating,
            net_investing=net_investing,
            net_financing=net_financing,
            opening_cash=_q(opening_cash),
            net_change=net_change,
            closing_cash=closing_cash,
            balanced=closing_cash == gl_cash,
        )

    # ---- day book ------------------------------------------------------------

    async def day_book(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        voucher_type: str | None = None,
        limit: int = 500,
        offset: int = 0,
    ) -> schemas.GLDayBookResponse:
        accounts = await self._account_map()
        entries = await self.repo.gl_entries_with_lines(
            date_from=date_from,
            date_to=date_to,
            voucher_type=voucher_type,
            limit=limit,
            offset=offset,
        )
        result = []
        for entry in entries:
            result.append(
                schemas.GLDayBookEntry(
                    id=entry.id,
                    entry_no=entry.entry_no,
                    entry_date=entry.entry_date,
                    voucher_type=entry.voucher_type,
                    reference=entry.reference,
                    narration=entry.narration,
                    status=entry.status,
                    source_type=entry.source_type,
                    source_id=entry.source_id,
                    lines=[
                        schemas.GLDayBookLine(
                            line_no=line.line_no,
                            account_id=line.account_id,
                            account_code=accounts[line.account_id].code,
                            account_name=accounts[line.account_id].name,
                            debit=_q(line.debit),
                            credit=_q(line.credit),
                            description=line.description,
                            party_type=line.party_type,
                            party_id=line.party_id,
                        )
                        for line in sorted(entry.lines, key=lambda line: line.line_no)
                    ],
                )
            )
        return schemas.GLDayBookResponse(
            date_from=date_from,
            date_to=date_to,
            count=len(result),
            entries=result,
        )

    # ---- ledger --------------------------------------------------------------

    async def ledger(
        self,
        account_id: UUID,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> schemas.GLLedgerResponse:
        accounts = await self._account_map()
        account = accounts.get(account_id)
        if account is None:
            raise NotFoundError("Account not found")

        opening_balance = ZERO
        if date_from is not None:
            opening_lines = await self.repo.gl_lines(
                account_id=account_id,
                date_to=date_from - timedelta(days=1),
            )
            opening_balance = _q(sum((_line_amount(line) for line in opening_lines), ZERO))

        lines = await self.repo.gl_lines(
            account_id=account_id, date_from=date_from, date_to=date_to
        )
        running = opening_balance
        result: list[schemas.GLLedgerLine] = []
        total_debit = ZERO
        total_credit = ZERO
        for line in lines:
            running = _q(running + _line_amount(line))
            total_debit += line.debit
            total_credit += line.credit
            result.append(
                schemas.GLLedgerLine(
                    entry_id=line.entry_id,
                    entry_no=line.entry_no,
                    entry_date=line.entry_date,
                    voucher_type=line.voucher_type,
                    reference=line.reference,
                    narration=line.narration,
                    description=line.description,
                    debit=_q(line.debit),
                    credit=_q(line.credit),
                    balance=running,
                )
            )

        return schemas.GLLedgerResponse(
            account_id=account.id,
            code=account.code,
            name=account.name,
            account_type=account.account_type,
            normal_balance=account.normal_balance,
            date_from=date_from,
            date_to=date_to,
            opening_balance=opening_balance,
            total_debit=_q(total_debit),
            total_credit=_q(total_credit),
            closing_balance=running,
            lines=result,
        )

    # ---- party statement -----------------------------------------------------

    async def party_statement(
        self,
        *,
        party_type: str,
        party_id: UUID | None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> schemas.GLPartyStatementResponse:
        opening_balance = ZERO
        if date_from is not None:
            opening_lines = await self.repo.gl_lines(
                account_code=RECEIVABLE_CODE,
                party_type=party_type,
                party_id=party_id,
                party_id_is_null=party_id is None,
                date_to=date_from - timedelta(days=1),
            )
            opening_balance = _q(sum((line.debit - line.credit for line in opening_lines), ZERO))

        lines = await self.repo.gl_lines(
            account_code=RECEIVABLE_CODE,
            party_type=party_type,
            party_id=party_id,
            party_id_is_null=party_id is None,
            date_from=date_from,
            date_to=date_to,
        )
        running = opening_balance
        result: list[schemas.GLPartyStatementLine] = []
        total_debit = ZERO
        total_credit = ZERO
        for line in lines:
            running = _q(running + line.debit - line.credit)
            total_debit += line.debit
            total_credit += line.credit
            result.append(
                schemas.GLPartyStatementLine(
                    entry_id=line.entry_id,
                    entry_no=line.entry_no,
                    entry_date=line.entry_date,
                    voucher_type=line.voucher_type,
                    reference=line.reference,
                    narration=line.narration,
                    debit=_q(line.debit),
                    credit=_q(line.credit),
                    balance=running,
                )
            )

        if party_id is None:
            party_name = "Unassigned"
        else:
            names = await self.repo.customer_names({party_id})
            party_name = names.get(party_id, str(party_id))

        return schemas.GLPartyStatementResponse(
            party_type=party_type,
            party_id=party_id,
            party_name=party_name,
            account_code=RECEIVABLE_CODE,
            date_from=date_from,
            date_to=date_to,
            opening_balance=opening_balance,
            total_debit=_q(total_debit),
            total_credit=_q(total_credit),
            closing_balance=running,
            lines=result,
        )

    # ---- receivables aging ---------------------------------------------------

    async def aging(self, *, as_of: date | None = None) -> schemas.GLAgingResponse:
        as_of = as_of or date.today()
        lines = await self.repo.gl_lines(account_code=RECEIVABLE_CODE, date_to=as_of)

        open_items: dict[UUID | None, list[list]] = {}
        credits: dict[UUID | None, Decimal] = {}
        for line in lines:
            party = line.party_id
            queue = open_items.setdefault(party, [])
            if line.debit:
                queue.append([line.entry_date, _q(line.debit)])
            elif line.credit:
                remaining = _q(line.credit)
                while remaining > ZERO and queue:
                    item = queue[0]
                    if item[1] <= remaining:
                        remaining = _q(remaining - item[1])
                        queue.pop(0)
                    else:
                        item[1] = _q(item[1] - remaining)
                        remaining = ZERO
                if remaining > ZERO:
                    credits[party] = _q(credits.get(party, ZERO) + remaining)

        party_ids = {party for party in open_items if party is not None}
        names = await self.repo.customer_names(party_ids)

        rows: list[schemas.GLAgingRow] = []
        for party in set(open_items) | set(credits):
            buckets = {
                "current": ZERO,
                "days_31_60": ZERO,
                "days_61_90": ZERO,
                "days_over_90": ZERO,
            }
            for item_date, amount in open_items.get(party, []):
                age = (as_of - item_date).days
                if age <= 30:
                    buckets["current"] += amount
                elif age <= 60:
                    buckets["days_31_60"] += amount
                elif age <= 90:
                    buckets["days_61_90"] += amount
                else:
                    buckets["days_over_90"] += amount

            total = _q(sum(buckets.values(), ZERO))
            credit_balance = _q(credits.get(party, ZERO))
            if total == ZERO and credit_balance == ZERO:
                continue

            party_name = "Unassigned" if party is None else names.get(party, str(party))

            rows.append(
                schemas.GLAgingRow(
                    party_id=party,
                    party_name=party_name,
                    current=_q(buckets["current"]),
                    days_31_60=_q(buckets["days_31_60"]),
                    days_61_90=_q(buckets["days_61_90"]),
                    days_over_90=_q(buckets["days_over_90"]),
                    total=total,
                    credit_balance=credit_balance,
                )
            )

        rows.sort(key=lambda row: row.party_name)
        totals = schemas.GLAgingRow(
            party_id=None,
            party_name="Total",
            current=_q(sum((row.current for row in rows), ZERO)),
            days_31_60=_q(sum((row.days_31_60 for row in rows), ZERO)),
            days_61_90=_q(sum((row.days_61_90 for row in rows), ZERO)),
            days_over_90=_q(sum((row.days_over_90 for row in rows), ZERO)),
            total=_q(sum((row.total for row in rows), ZERO)),
            credit_balance=_q(sum((row.credit_balance for row in rows), ZERO)),
        )
        buckets = [
            schemas.GLAgingBucket(label="0-30 days", amount=totals.current),
            schemas.GLAgingBucket(label="31-60 days", amount=totals.days_31_60),
            schemas.GLAgingBucket(label="61-90 days", amount=totals.days_61_90),
            schemas.GLAgingBucket(label="90+ days", amount=totals.days_over_90),
        ]
        return schemas.GLAgingResponse(as_of=as_of, rows=rows, totals=totals, buckets=buckets)

    # ---- tax summary ---------------------------------------------------------

    async def tax_summary(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> schemas.GLTaxSummaryResponse:
        output_lines = await self.repo.gl_lines(
            account_code=VAT_OUTPUT_CODE, date_from=date_from, date_to=date_to
        )
        input_lines = await self.repo.gl_lines(
            account_code=VAT_INPUT_CODE, date_from=date_from, date_to=date_to
        )
        tds_receivable_lines = await self.repo.gl_lines(
            account_code=TDS_RECEIVABLE_CODE, date_from=date_from, date_to=date_to
        )
        tds_payable_lines = await self.repo.gl_lines(
            account_code=TDS_PAYABLE_CODE, date_from=date_from, date_to=date_to
        )

        def bucket(period: str) -> dict[str, Decimal]:
            return periods.setdefault(
                period,
                {
                    "output": ZERO,
                    "input": ZERO,
                    "tds_receivable": ZERO,
                    "tds_payable": ZERO,
                },
            )

        periods: dict[str, dict[str, Decimal]] = {}
        for line in output_lines:
            period = line.entry_date.strftime("%Y-%m")
            bucket(period)["output"] += line.credit - line.debit
        for line in input_lines:
            period = line.entry_date.strftime("%Y-%m")
            bucket(period)["input"] += line.debit - line.credit
        for line in tds_receivable_lines:
            period = line.entry_date.strftime("%Y-%m")
            bucket(period)["tds_receivable"] += line.debit - line.credit
        for line in tds_payable_lines:
            period = line.entry_date.strftime("%Y-%m")
            bucket(period)["tds_payable"] += line.credit - line.debit

        result: list[schemas.GLTaxSummaryLine] = []
        total_output = ZERO
        total_input = ZERO
        total_tds_receivable = ZERO
        total_tds_payable = ZERO
        for period in sorted(periods):
            output = _q(periods[period]["output"])
            vat_input = _q(periods[period]["input"])
            tds_receivable = _q(periods[period]["tds_receivable"])
            tds_payable = _q(periods[period]["tds_payable"])
            if (
                output == ZERO
                and vat_input == ZERO
                and tds_receivable == ZERO
                and tds_payable == ZERO
            ):
                continue
            result.append(
                schemas.GLTaxSummaryLine(
                    period=period,
                    output_vat=output,
                    input_vat=vat_input,
                    net_payable=_q(output - vat_input),
                    tds_receivable=tds_receivable,
                    tds_payable=tds_payable,
                    net_tds=_q(tds_payable - tds_receivable),
                )
            )
            total_output += output
            total_input += vat_input
            total_tds_receivable += tds_receivable
            total_tds_payable += tds_payable

        total_output = _q(total_output)
        total_input = _q(total_input)
        total_tds_receivable = _q(total_tds_receivable)
        total_tds_payable = _q(total_tds_payable)
        return schemas.GLTaxSummaryResponse(
            date_from=date_from,
            date_to=date_to,
            output_vat=total_output,
            input_vat=total_input,
            net_payable=_q(total_output - total_input),
            tds_receivable=total_tds_receivable,
            tds_payable=total_tds_payable,
            net_tds=_q(total_tds_payable - total_tds_receivable),
            lines=result,
        )
