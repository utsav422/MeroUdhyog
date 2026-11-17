from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.models import Account


@dataclass(frozen=True)
class AccountSpec:
    code: str
    name: str
    account_type: str
    normal_balance: str
    parent_code: str | None = None
    is_group: bool = False


DEFAULT_ACCOUNTS: tuple[AccountSpec, ...] = (
    AccountSpec("1000", "Current Assets", "asset", "debit", is_group=True),
    AccountSpec("1010", "Cash in Hand", "asset", "debit", "1000"),
    AccountSpec("1020", "Bank Accounts", "asset", "debit", "1000"),
    AccountSpec("1030", "Accounts Receivable", "asset", "debit", "1000"),
    AccountSpec("1040", "Inventory - Raw Materials", "asset", "debit", "1000"),
    AccountSpec("1050", "Inventory - Finished Goods", "asset", "debit", "1000"),
    AccountSpec("1060", "Advance to Suppliers", "asset", "debit", "1000"),
    AccountSpec("1070", "VAT Input (Input Tax Credit)", "asset", "debit", "1000"),
    AccountSpec("1080", "Prepaid Expenses", "asset", "debit", "1000"),
    AccountSpec("1085", "TDS Receivable", "asset", "debit", "1000"),
    AccountSpec("1090", "Other Current Assets", "asset", "debit", "1000"),
    AccountSpec("1200", "Non-Current Assets", "asset", "debit", is_group=True),
    AccountSpec("1210", "Plant & Machinery", "asset", "debit", "1200"),
    AccountSpec("1220", "Furniture & Fixtures", "asset", "debit", "1200"),
    AccountSpec("1230", "Vehicles", "asset", "debit", "1200"),
    AccountSpec("1240", "Office Equipment", "asset", "debit", "1200"),
    AccountSpec("1290", "Accumulated Depreciation", "asset", "credit", "1200"),
    AccountSpec("1300", "Intangible Assets", "asset", "debit", is_group=True),
    AccountSpec("1310", "Software & Licenses", "asset", "debit", "1300"),
    AccountSpec("2000", "Current Liabilities", "liability", "credit", is_group=True),
    AccountSpec("2010", "Accounts Payable", "liability", "credit", "2000"),
    AccountSpec("2020", "Accrued Expenses", "liability", "credit", "2000"),
    AccountSpec("2030", "VAT Output (VAT Payable)", "liability", "credit", "2000"),
    AccountSpec("2040", "TDS Payable", "liability", "credit", "2000"),
    AccountSpec("2050", "Salaries Payable", "liability", "credit", "2000"),
    AccountSpec("2060", "Short-term Loans", "liability", "credit", "2000"),
    AccountSpec("2090", "Other Current Liabilities", "liability", "credit", "2000"),
    AccountSpec(
        "2100", "Non-Current Liabilities", "liability", "credit", is_group=True
    ),
    AccountSpec("2110", "Long-term Loans", "liability", "credit", "2100"),
    AccountSpec("3000", "Owner's Equity", "equity", "credit", is_group=True),
    AccountSpec("3010", "Owner's Capital", "equity", "credit", "3000"),
    AccountSpec("3020", "Owner's Drawings", "equity", "debit", "3000"),
    AccountSpec("3030", "Retained Earnings", "equity", "credit", "3000"),
    AccountSpec("3040", "Current Year Earnings", "equity", "credit", "3000"),
    AccountSpec("3090", "Opening Balance Equity", "equity", "credit", "3000"),
    AccountSpec("4000", "Sales Revenue", "income", "credit"),
    AccountSpec("4010", "Sales Returns & Allowances", "income", "debit"),
    AccountSpec("4020", "Other Income", "income", "credit"),
    AccountSpec("4030", "Discount Received", "income", "credit"),
    AccountSpec("5000", "Cost of Goods Sold", "expense", "debit"),
    AccountSpec("5010", "Purchase Returns", "expense", "credit"),
    AccountSpec("5020", "Freight & Cartage Inward", "expense", "debit"),
    AccountSpec("5030", "Direct Labour", "expense", "debit"),
    AccountSpec("5040", "Manufacturing Overhead", "expense", "debit"),
    AccountSpec("6000", "Operating Expenses", "expense", "debit", is_group=True),
    AccountSpec("6010", "Salaries & Wages", "expense", "debit", "6000"),
    AccountSpec("6020", "Rent", "expense", "debit", "6000"),
    AccountSpec("6030", "Utilities", "expense", "debit", "6000"),
    AccountSpec("6040", "Office Supplies", "expense", "debit", "6000"),
    AccountSpec("6050", "Marketing & Advertising", "expense", "debit", "6000"),
    AccountSpec("6060", "Travel & Conveyance", "expense", "debit", "6000"),
    AccountSpec("6070", "Repairs & Maintenance", "expense", "debit", "6000"),
    AccountSpec("6080", "Professional Fees", "expense", "debit", "6000"),
    AccountSpec("6090", "Bank Charges", "expense", "debit", "6000"),
    AccountSpec("6100", "Depreciation Expense", "expense", "debit", "6000"),
    AccountSpec("6110", "Bad Debts", "expense", "debit", "6000"),
    AccountSpec("6190", "Miscellaneous Expenses", "expense", "debit", "6000"),
    AccountSpec("6900", "Other Expenses", "expense", "debit", is_group=True),
    AccountSpec("6910", "Interest Expense", "expense", "debit", "6900"),
    AccountSpec("6920", "Tax Expense", "expense", "debit", "6900"),
)


async def seed_default_accounts(session: AsyncSession, tenant_id: UUID) -> None:
    existing = {
        account.code: account
        for account in (
            await session.execute(
                select(Account).where(Account.tenant_id == tenant_id)
            )
        )
        .scalars()
        .all()
    }

    created: dict[str, Account] = {}
    for spec in DEFAULT_ACCOUNTS:
        if spec.code in existing:
            continue
        account = Account(
            tenant_id=tenant_id,
            code=spec.code,
            name=spec.name,
            account_type=spec.account_type,
            normal_balance=spec.normal_balance,
            is_group=spec.is_group,
            is_system=True,
            is_active=True,
        )
        session.add(account)
        created[spec.code] = account

    if created:
        await session.flush()

    by_code = {**existing, **created}
    for spec in DEFAULT_ACCOUNTS:
        if spec.parent_code is None:
            continue
        account = by_code.get(spec.code)
        parent = by_code.get(spec.parent_code)
        if account is None or parent is None:
            continue
        if account.parent_id != parent.id:
            account.parent_id = parent.id

    await session.flush()
