from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting import schemas
from app.modules.accounting.audit import record
from app.modules.accounting.models import (
    Account,
    BankAccount,
    BankStatementLine,
    JournalEntry,
    JournalLine,
)
from app.modules.accounting.repository import AccountingRepository
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError

ZERO = Decimal("0.00")
CENT = Decimal("0.01")


def _q(value: Decimal | int | str | None) -> Decimal:
    return Decimal(value or 0).quantize(CENT)


def _read_account(account: BankAccount, gl: Account) -> schemas.BankAccountRead:
    return schemas.BankAccountRead(
        id=account.id,
        name=account.name,
        bank_name=account.bank_name,
        account_number=account.account_number,
        currency=account.currency,
        gl_account_id=account.gl_account_id,
        gl_account_code=gl.code,
        gl_account_name=gl.name,
        opening_balance=_q(account.opening_balance),
        is_active=account.is_active,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


class BankService:
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        actor_id: UUID | None = None,
    ) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.actor_id = actor_id
        self.repo = AccountingRepository(session, tenant_id)

    async def list_accounts(self) -> list[schemas.BankAccountRead]:
        rows = (
            await self.session.execute(
                select(BankAccount, Account)
                .join(Account, Account.id == BankAccount.gl_account_id)
                .where(BankAccount.tenant_id == self.tenant_id)
                .order_by(BankAccount.name)
            )
        ).all()
        return [_read_account(account, gl) for account, gl in rows]

    async def create_account(
        self, data: schemas.BankAccountCreate
    ) -> schemas.BankAccountRead:
        gl = await self._gl_account(data.gl_account_id)
        existing = (
            await self.session.execute(
                select(BankAccount.id).where(
                    BankAccount.tenant_id == self.tenant_id,
                    BankAccount.name == data.name,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise ConflictError("A bank account with this name already exists")

        account = BankAccount(
            tenant_id=self.tenant_id,
            name=data.name,
            bank_name=data.bank_name,
            account_number=data.account_number,
            currency=data.currency.upper(),
            gl_account_id=data.gl_account_id,
            opening_balance=_q(data.opening_balance),
            is_active=data.is_active,
        )
        self.session.add(account)
        await self.session.flush()
        await record(
            self.session,
            self.tenant_id,
            entity_type="bank_account",
            entity_id=account.id,
            action="create",
            actor_id=self.actor_id,
            after={
                "name": account.name,
                "gl_account_id": str(account.gl_account_id),
                "opening_balance": str(account.opening_balance),
            },
        )
        return _read_account(account, gl)

    async def list_lines(
        self,
        account_id: UUID,
        *,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[schemas.BankStatementLineRead]:
        await self._bank_account(account_id)
        conditions = [
            BankStatementLine.tenant_id == self.tenant_id,
            BankStatementLine.bank_account_id == account_id,
        ]
        if status is not None:
            if status not in {"unmatched", "matched"}:
                raise ValidationError("status must be 'unmatched' or 'matched'")
            conditions.append(BankStatementLine.status == status)
        if date_from is not None:
            conditions.append(BankStatementLine.statement_date >= date_from)
        if date_to is not None:
            conditions.append(BankStatementLine.statement_date <= date_to)
        rows = (
            await self.session.execute(
                select(BankStatementLine)
                .where(*conditions)
                .order_by(
                    BankStatementLine.statement_date,
                    BankStatementLine.created_at,
                )
                .limit(limit)
                .offset(offset)
            )
        ).scalars()
        return [
            schemas.BankStatementLineRead.model_validate(line) for line in rows
        ]

    async def import_lines(
        self,
        account_id: UUID,
        data: schemas.BankStatementImport,
    ) -> list[schemas.BankStatementLineRead]:
        await self._bank_account(account_id)
        created: list[BankStatementLine] = []
        for line in data.lines:
            if _q(line.amount) == ZERO:
                raise ValidationError("Statement line amount cannot be zero")
            statement_line = BankStatementLine(
                tenant_id=self.tenant_id,
                bank_account_id=account_id,
                statement_date=line.statement_date,
                description=line.description,
                reference=line.reference,
                amount=_q(line.amount),
            )
            self.session.add(statement_line)
            created.append(statement_line)
        await self.session.flush()
        await record(
            self.session,
            self.tenant_id,
            entity_type="bank_account",
            entity_id=account_id,
            action="import",
            actor_id=self.actor_id,
            after={"lines": len(created)},
        )
        return [
            schemas.BankStatementLineRead.model_validate(line) for line in created
        ]

    async def auto_match(
        self,
        account_id: UUID,
        data: schemas.BankAutoMatchRequest,
    ) -> schemas.BankAutoMatchResponse:
        account, _ = await self._bank_account(account_id)
        statement_lines = (
            (
                await self.session.execute(
                    select(BankStatementLine)
                    .where(
                        BankStatementLine.tenant_id == self.tenant_id,
                        BankStatementLine.bank_account_id == account_id,
                        BankStatementLine.status == "unmatched",
                    )
                    .order_by(BankStatementLine.statement_date)
                )
            )
            .scalars()
            .all()
        )
        if not statement_lines:
            return schemas.BankAutoMatchResponse(
                matched=0,
                unmatched=0,
                lines=await self.list_lines(account_id),
            )

        matched_line_ids = set(
            (
                await self.session.execute(
                    select(BankStatementLine.matched_line_id).where(
                        BankStatementLine.tenant_id == self.tenant_id,
                        BankStatementLine.matched_line_id.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        window = timedelta(days=data.date_window_days)
        candidates = await self.repo.gl_lines(
            account_id=account.gl_account_id,
            date_from=min(line.statement_date for line in statement_lines) - window,
            date_to=max(line.statement_date for line in statement_lines) + window,
        )
        candidates = [
            line for line in candidates if line.line_id not in matched_line_ids
        ]

        used: set[UUID] = set()
        matched = 0
        now = datetime.now(UTC)
        for statement_line in statement_lines:
            amount = _q(statement_line.amount)
            best = None
            best_key = None
            for candidate in candidates:
                if candidate.line_id in used:
                    continue
                if abs(candidate.entry_date - statement_line.statement_date) > window:
                    continue
                if not self._line_matches_amount(candidate, amount):
                    continue
                key = (
                    abs(candidate.entry_date - statement_line.statement_date),
                    candidate.entry_date,
                    candidate.line_no,
                )
                if best_key is None or key < best_key:
                    best = candidate
                    best_key = key
            if best is None:
                continue
            statement_line.status = "matched"
            statement_line.matched_entry_id = best.entry_id
            statement_line.matched_line_id = best.line_id
            statement_line.matched_at = now
            statement_line.matched_by = self.actor_id
            used.add(best.line_id)
            matched += 1

        await self.session.flush()
        await record(
            self.session,
            self.tenant_id,
            entity_type="bank_account",
            entity_id=account_id,
            action="auto_match",
            actor_id=self.actor_id,
            after={"matched": matched, "window_days": data.date_window_days},
        )
        lines = await self.list_lines(account_id)
        return schemas.BankAutoMatchResponse(
            matched=matched,
            unmatched=sum(1 for line in lines if line.status == "unmatched"),
            lines=lines,
        )

    async def match_line(
        self,
        line_id: UUID,
        data: schemas.BankMatchRequest,
    ) -> schemas.BankStatementLineRead:
        line = await self._statement_line(line_id)
        if line.status == "matched":
            raise ConflictError("Statement line is already matched")
        account, _ = await self._bank_account(line.bank_account_id)
        journal_line = await self._journal_line(data.journal_line_id)
        if journal_line.account_id != account.gl_account_id:
            raise ValidationError("Journal line does not belong to this bank account")
        if not self._line_matches_amount(journal_line, _q(line.amount)):
            raise ValidationError(
                "Journal line amount or direction does not match the statement line"
            )
        already = (
            await self.session.execute(
                select(BankStatementLine.id).where(
                    BankStatementLine.tenant_id == self.tenant_id,
                    BankStatementLine.matched_line_id == journal_line.id,
                )
            )
        ).scalar_one_or_none()
        if already is not None:
            raise ConflictError("Journal line is already matched")

        line.status = "matched"
        line.matched_entry_id = journal_line.journal_entry_id
        line.matched_line_id = journal_line.id
        line.matched_at = datetime.now(UTC)
        line.matched_by = self.actor_id
        await self.session.flush()
        await record(
            self.session,
            self.tenant_id,
            entity_type="bank_statement_line",
            entity_id=line.id,
            action="match",
            actor_id=self.actor_id,
            after={"journal_line_id": str(journal_line.id)},
        )
        return schemas.BankStatementLineRead.model_validate(line)

    async def unmatch_line(self, line_id: UUID) -> schemas.BankStatementLineRead:
        line = await self._statement_line(line_id)
        if line.status != "matched":
            raise ConflictError("Statement line is not matched")
        before = {
            "journal_line_id": str(line.matched_line_id)
            if line.matched_line_id
            else None
        }
        line.status = "unmatched"
        line.matched_entry_id = None
        line.matched_line_id = None
        line.matched_at = None
        line.matched_by = None
        await self.session.flush()
        await record(
            self.session,
            self.tenant_id,
            entity_type="bank_statement_line",
            entity_id=line.id,
            action="unmatch",
            actor_id=self.actor_id,
            before=before,
        )
        return schemas.BankStatementLineRead.model_validate(line)

    async def reconciliation(
        self,
        account_id: UUID,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> schemas.BankReconciliationResponse:
        account, gl = await self._bank_account(account_id)
        conditions = [
            BankStatementLine.tenant_id == self.tenant_id,
            BankStatementLine.bank_account_id == account_id,
        ]
        if date_from is not None:
            conditions.append(BankStatementLine.statement_date >= date_from)
        if date_to is not None:
            conditions.append(BankStatementLine.statement_date <= date_to)
        lines = (
            (
                await self.session.execute(
                    select(BankStatementLine)
                    .where(*conditions)
                    .order_by(BankStatementLine.statement_date)
                )
            )
            .scalars()
            .all()
        )
        statement_total = _q(sum((line.amount for line in lines), ZERO))
        matched_total = _q(
            sum((line.amount for line in lines if line.status == "matched"), ZERO)
        )
        unmatched_total = _q(statement_total - matched_total)
        statement_balance = _q(account.opening_balance + statement_total)
        book_balance = _q(
            await self.repo.gl_account_balance(account.gl_account_id, date_to=date_to)
        )
        difference = _q(book_balance - statement_balance)
        return schemas.BankReconciliationResponse(
            bank_account_id=account.id,
            name=account.name,
            gl_account_id=account.gl_account_id,
            gl_account_code=gl.code,
            date_from=date_from,
            date_to=date_to,
            opening_balance=_q(account.opening_balance),
            statement_total=statement_total,
            statement_balance=statement_balance,
            book_balance=book_balance,
            matched_total=matched_total,
            unmatched_total=unmatched_total,
            difference=difference,
            balanced=abs(difference) <= CENT,
            lines=[
                schemas.BankStatementLineRead.model_validate(line) for line in lines
            ],
        )

    async def _gl_account(self, account_id: UUID) -> Account:
        account = (
            await self.session.execute(
                select(Account).where(
                    Account.tenant_id == self.tenant_id,
                    Account.id == account_id,
                )
            )
        ).scalar_one_or_none()
        if account is None:
            raise NotFoundError("GL account not found")
        if account.is_group or account.account_type != "asset":
            raise ValidationError("Bank accounts must map to a non-group asset account")
        return account

    async def _bank_account(self, account_id: UUID) -> tuple[BankAccount, Account]:
        row = (
            await self.session.execute(
                select(BankAccount, Account)
                .join(Account, Account.id == BankAccount.gl_account_id)
                .where(
                    BankAccount.tenant_id == self.tenant_id,
                    BankAccount.id == account_id,
                )
            )
        ).one_or_none()
        if row is None:
            raise NotFoundError("Bank account not found")
        return row

    async def _statement_line(self, line_id: UUID) -> BankStatementLine:
        line = (
            await self.session.execute(
                select(BankStatementLine).where(
                    BankStatementLine.tenant_id == self.tenant_id,
                    BankStatementLine.id == line_id,
                )
            )
        ).scalar_one_or_none()
        if line is None:
            raise NotFoundError("Bank statement line not found")
        return line

    async def _journal_line(self, line_id: UUID) -> JournalLine:
        line = (
            await self.session.execute(
                select(JournalLine)
                .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
                .where(
                    JournalLine.tenant_id == self.tenant_id,
                    JournalLine.id == line_id,
                    JournalEntry.tenant_id == self.tenant_id,
                    JournalEntry.status == "posted",
                )
            )
        ).scalar_one_or_none()
        if line is None:
            raise NotFoundError("Journal line not found")
        return line

    @staticmethod
    def _line_matches_amount(line, amount: Decimal) -> bool:
        if amount > ZERO:
            return _q(line.debit) == amount
        if amount < ZERO:
            return _q(line.credit) == -amount
        return False
