# Stage 1 — Accounting & ERP Architecture Assessment

Status: Stage 1 (inspection only, no code changes)
Scope: `/Users/work/Desktop/FactoryCRM` — backend + frontend + database
Goal: Establish an accurate baseline before converting the current single-entry
reporting layer into a real double-entry accounting system.

---

## 1. Executive summary

The application today has a **derived, single-entry, cash-basis reporting layer**.
It is not an accounting ledger. Four statements (Trial Balance, P&L, Balance
Sheet, Cash Flow) are computed on request from the `transactions` table plus
orders and live inventory, combined with a single per-tenant row of opening
balances (`accounting_settings`). There is no chart of accounts, no journal,
no voucher, no financial year, no posting rules, and no immutable audit trail.

The trial balance "always balances" because it is _constructed_ as balanced
double-entry postings from single-entry rows — it therefore cannot detect
errors. Several figures are estimates or heuristics (COGS from latest cost
price, inventory from latest price, cash-flow classification from keywords in
the description). Two independent accounting engines disagree on reversal
semantics.

The good news: the data model already uses `Decimal`/`Numeric` throughout,
transactions are tenant-scoped, reversal rows exist, inventory movements and
per-variant stock are tracked with row locking, and the frontend already
separates API access from presentation. The upgrade path is additive and
non-destructive: introduce a real general ledger alongside the existing
tables and migrate historical data forward.

---

## 2. Runtime environment (verified)

| Item           | Value                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Backend        | FastAPI, SQLAlchemy 2 async, Alembic, psycopg3, Python 3.13 (`backend/.venv`)                           |
| Backend URL    | `http://localhost:8000` (`/health` = 200)                                                               |
| Frontend       | Next.js 16.3.3 App Router, Mantine 9.6, TanStack Query, Tailwind, Phosphor                              |
| Frontend URL   | `http://localhost:3000`; `/api/*` rewritten to `BACKEND_URL`                                            |
| Database       | PostgreSQL 18.4, local, `postgresql://postgres@localhost:5432/fastapi`                                  |
| Migration head | `0029_accounting_settings` (37 public tables)                                                           |
| Live data      | 38 users, 21 customers, 28 products, 36 variants, 30 orders, 27 transactions, 10 deliveries, 7 routes   |
| Auth           | JWT in httpOnly cookies (`access_token`, `refresh_token`, `csrf_token`), CSRF on mutating methods       |
| RBAC           | `Permissions` StrEnum + `ROLE_PERMISSIONS`; roles seeded per tenant                                     |
| Money type     | `Decimal` / `Numeric(14,2)` / `Numeric(16,2)` — no floats in financial math                             |
| Export         | CSV only (`frontend/lib/exportCsv.ts`); PDF via `reportlab` backend (khata bills); `openpyxl` installed |

Note: `backend/.env` now points at the local `fastapi` DB. A separate Neon
branch exists but is unused/empty.

---

## 3. Repository / module map

### Backend (`backend/app`)

```
core/            config, database (async engine/session), security (JWT/hash),
                 dependencies (current_user, tenant, permission guards),
                 permissions (Permissions StrEnum, ROLE_PERMISSIONS)
modules/
  auth/          login, refresh, logout, change-password
  tenants/       tenant records, membership, onboarding
  users/         staff/users
  roles/         per-tenant role seeding, custom roles
  customers/     customers + credit limits
  products/      products, variants, variant prices, stock, inventory movements
  categories/    product categories
  orders/        orders + items, status workflow, delivery
  deliveries/    delivery routes/agents/portal
  transactions/  single-entry ledger (sale/purchase/expense/receipt)
  khata/         customer ledger (khata), payment allocation, receipts
  payments/      payment recording
  accounting/    derived statements + accounting_settings
  finance/       monthly rollups / dashboard finance
  audits/        business-rule checks over transactions
  imports/       data import
  predictions/   simple forecasting
  settings/      bill format, etc.
```

### Frontend (`frontend`)

```
app/(dashboard)/accounting/{page,trial-balance,profit-loss,balance-sheet,cash-flow}
app/(dashboard)/finance, khata, payments, orders, products, customers, ...
features/accounting/{api.ts, components/*}
features/finance, features/khata, ...
components/layout/Sidebar.tsx
components/shared/{DataTable, FilterBar, KPICard, PageHeader, ...}
lib/api-client.ts, lib/exportCsv.ts
```

Accounting sidebar group currently exposes: Overview, Trial Balance, Profit &
Loss, Balance Sheet, Cash Flow. Finance (rollups) and Audits sit under other
groups.

---

## 4. Current accounting model (as implemented)

### 4.1 The ledger: `transactions`

One flat table, one row per economic event:

- `type ∈ {sale, purchase, expense, receipt}`
- `amount Numeric(14,2)`, optional `quantity`, `unit_price`, `tax_amount`,
  `discount_amount`
- `transaction_date`, `description`, `customer_id`, `product_id`
- `reverses_id` → self-FK; a reversal row points at the original
- `currency` (server default `'USD'`), `metadata` JSONB, `is_active`
- indexes on `(tenant_id, transaction_date)`, `(tenant_id, type)`,
  `(tenant_id, customer_id)`

There is **no debit/credit column, no account column, no journal grouping**.
An event is one signed amount, not a balanced pair of postings.

### 4.2 Opening balances: `accounting_settings`

One row per tenant (`uq_accounting_settings_tenant`) holding:

- `business_name`, `fiscal_year_start_month`, `book_start_date`
- `opening_cash`, `opening_receivables`, `opening_inventory`,
  `opening_other_assets`, `opening_payables`, `opening_loans`,
  `opening_capital` (all `Numeric(16,2)`, normal-balance-side positive)
- `currency` (default `'NPR'`)

This is the _only_ stored accounting state. Everything else is computed.

### 4.3 Statement derivation (`modules/accounting/service.py`)

`AccountingService` reads transactions via `AccountingRepository` and builds:

**Trial Balance** (`trial_balance`)

- Maps each transaction type to a fixed pair of hard-coded accounts:
  - `receipt` → Dr Cash & Bank (1000) / Cr Accounts Receivable (1100)
  - `sale` → Dr Accounts Receivable (1100) / Cr Sales Revenue (4000)
  - `purchase` → Dr Inventory (1200) / Cr Cash & Bank (1000)
  - `expense` → Dr Operating Expenses (6000) / Cr Cash & Bank (1000)
- Adds opening balances as double-entry postings.
- Nets each account to a debit or credit side and reports totals.
- Because postings are generated as balanced pairs, `balanced` is
  **true by construction** and proves nothing about data quality.

**Profit & Loss** (`profit_and_loss`)

- Revenue = sum of `sale` rows (reversals negated via `_signed`).
- Operating expenses = sum of `expense` rows.
- COGS = `repo.cost_of_goods_sold()`: delivered/completed `OrderItem`
  quantities × the variant's **latest** `VariantPrice.cost_price`; if no variant
  has a cost price, falls back to total `purchase` transactions.
- Gross profit = revenue − COGS; net = gross − opex.

**Balance Sheet** (`balance_sheet`, as-of)

- Cash = receipts − expenses − purchases (sales are treated as credit).
- Receivables = sales − receipts.
- Inventory = live stock valuation if > 0, else purchases − COGS.
- Retained earnings = all-time P&L net profit.
- Adds opening balances per line; reports `balanced` and `difference`.

**Cash Flow** (`cash_flow`, period)

- Receipts = operating inflow; purchases + non-capex expenses = operating
  outflow.
- Investing vs financing split by **keyword matching on `description`**
  (`asset/equipment/machine/vehicle` → investing;
  `loan/capital/drawing/dividend` → financing).
- Closing cash = opening cash + net change.

### 4.4 Secondary engine (`modules/finance/calculator.py`)

`fold()` produces per-(month, currency) totals for dashboard/reporting:

- `sale` → revenue, `purchase` → COGS, `expense` → opex.
- Reversals are handled by **remapping the bucket**: `REVERSAL_TYPE`
  maps reverse(sale)→purchase, reverse(purchase)→sale, reverse(expense)→expense,
  then negates the amount.

### 4.5 Khata (`modules/khata`)

`ledger_entries` + `ledger_allocations` are a **customer subledger** (who owes
what, payments allocated to bills). This is _not_ a general ledger and does not
post to cash/AR accounts.

### 4.6 Inventory & COGS

- `ProductVariant.stock_quantity` is the live stock; `InventoryMovement` records
  movements; stock updates use `SELECT ... FOR UPDATE`.
- `VariantPrice` holds `price` and optional `cost_price` with `effective_from`.
- COGS and inventory valuation both use the **latest** cost price, not the
  historical cost at the time of sale. There is no FIFO/weighted-average
  valuation and no stock-to-GL linkage.
- Two product tables coexist historically (`products` and `product`); the
  canonical model is `products` + `product_variants`.

---

## 5. Gap analysis vs a double-entry ERP

### 5.1 Missing foundational objects

| Capability                                                         | Status                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Chart of accounts (COA) with hierarchy, types, groups              | **Missing** (accounts are hard-coded strings)                  |
| Journal header / journal lines (balanced postings)                 | **Missing**                                                    |
| Voucher types (payment, receipt, journal, contra, sales, purchase) | **Missing**                                                    |
| Posting rules / automatic entries from business events             | **Missing** (statements re-derive instead)                     |
| Financial years & accounting periods                               | **Missing** (`fiscal_year_start_month` only)                   |
| Period locking / books closed                                      | **Missing**                                                    |
| Immutable audit trail (who changed what, when)                     | **Missing** (only `created_at`/`updated_at`)                   |
| Bank accounts & bank reconciliation                                | **Missing** (single "Cash & Bank" bucket)                      |
| Tax/VAT ledger (Nepal VAT, TDS)                                    | **Missing** (`tax_amount` exists but is unused in postings)    |
| Party subledgers tied to control accounts                          | Partial (khata is standalone)                                  |
| Multi-currency with revaluation                                    | Missing (single currency field, default `USD` on transactions) |
| Recurring / opening / adjustment entries                           | Missing                                                        |
| Attachments / source documents on vouchers                         | Missing                                                        |

### 5.2 Correctness issues in the current derivation

1. **Reversal semantics disagree between engines.** `finance/calculator.py`
   remaps a reversal into the _original_ bucket and negates it. The accounting
   service instead negates the reversal's own type. Example: a reversal of a
   `sale` is stored as `purchase` with `reverses_id`; finance correctly reduces
   revenue, but `accounting.profit_and_loss` only sums `sale`/`expense`, so that
   reversal **does not reduce revenue** there. The two reports can disagree.
2. **Trial balance cannot fail.** It is built from balanced synthetic postings,
   so `balanced` is meaningless as a control.
3. **COGS is approximate and time-inconsistent.** Uses latest cost price ×
   delivered quantities, filtered by `Order.updated_at` (not the sale/delivery
   date). Historical cost is not preserved; fallback to total purchases is not a
   real COGS figure.
4. **Inventory is a best-effort valuation.** Latest cost price per variant; the
   balance-sheet line switches between live valuation and ledger residual,
   which can jump.
5. **Cash-flow classification is heuristic.** Keyword matching on free-text
   `description` is fragile and unauditable.
6. **`book_start_date` is documented but not enforced.** The service docstring
   says pre-opening transactions are ignored; the code does not filter on it.
7. **Opening balances can leave the sheet unbalanced.** Opening capital is not
   derived from opening assets/liabilities; the UI just shows a difference.
8. **No closing entries.** Retained earnings is simply all-time net profit;
   there is no year-end close or opening-balance carry-forward.
9. **Currency inconsistency.** `transactions.currency` defaults to `'USD'`
   while `accounting_settings.currency` defaults to `'NPR'`; reports ignore
   currency entirely.
10. **Tax/discount ignored in postings.** `tax_amount` and `discount_amount`
    exist but never enter revenue, receivable, or tax accounts.
11. **N+1 queries.** `inventory_value()` and `cost_of_goods_sold()` issue one
    query per variant; will degrade as data grows.
12. **Description-based party/GL mapping.** No stable account codes on events,
    so any new report requires new hard-coded rules.

### 5.3 Data-integrity risks

- `reverses_id` uses `ON DELETE SET NULL`; deleting an original silently breaks
  reversal linkage.
- No DB constraint restricting `type` to the four known values.
- `transactions` has no `CHECK (amount >= 0)` or sign convention enforced.
- `ledger_entries` and `transactions` can diverge (two sources of truth for
  customer balances).
- Duplicate legacy `product` table risks confusion in joins/imports.

---

## 6. Tenant isolation & permissions

- Every accounting query filters `tenant_id`; repository is constructed with the
  tenant id from `core/dependencies.py`. Good baseline.
- `AccountingSettings` is unique per tenant and auto-created (`ensure_settings`).
- Permissions are centralized (`Permissions` StrEnum, `ROLE_PERMISSIONS`),
  with `owner` holding all permissions and roles seeded per tenant.
- Gaps for ERP: no accounting-specific permissions (e.g. `post_journal`,
  `close_period`, `view_ledger`, `manage_coa`), no separation of duties
  (creator vs approver), no per-account or per-branch restrictions, and no
  audit of who posted/changed a voucher.

---

## 7. Frontend assessment

- Accounting pages are thin clients over backend-computed statements; they
  format `Decimal` strings and export **CSV only**.
- `StatementShell` + `StatementRows` give a consistent statement layout and are
  reusable for new reports.
- No voucher entry UI, no chart-of-accounts UI, no ledger drill-down, no
  bank-reconciliation UI, no financial-year/period controls.
- `BalanceSheetPage` exposes opening balances via a drawer (positive on normal
  side), which is the only place accounting state is written from the UI.
- Exports: CSV on frontend; PDF (reportlab) and Excel (openpyxl) libraries are
  already available server-side but not used for financial statements.
- Sidebar groups are static; accounting is one group. New ERP screens (COA,
  vouchers, journals, day book, bank recon, aging, tax) will need nav entries
  and permission-aware visibility.

---

## 8. Migration / compatibility strategy (principles)

- **Additive only**: introduce new tables (accounts, journals, journal_lines,
  fiscal_years, periods, posting_rules, audit_log) without altering or dropping
  existing ones.
- **Dual-run**: keep the current derived statements working while the new GL is
  populated, then cut reports over once the GL reconciles.
- **Backfill**: generate opening journal entries from `accounting_settings`, and
  post historical `transactions` into the GL via a deterministic mapping, with a
  reconciliation report (GL vs legacy totals) before switching.
- **Idempotent, reversible migrations**; no destructive changes; preserve all
  live data and tenant isolation.
- **Money stays `Decimal`/`Numeric`**; no floats anywhere in financial math.
- **No fabricated tests or placeholder data**; verification uses real seeded
  data and explicit reconciliation checks.

---

## 9. Proposed phased plan (to be refined in Stage 2)

1. **Stage 2 — Chart of accounts & GL schema.** COA (hierarchical, typed),
   journal headers/lines, fiscal years/periods, posting rules, audit log.
   Seed a Nepal-appropriate default COA per tenant.
2. **Stage 3 — Posting engine & vouchers.** Deterministic event → journal
   postings (sales, purchases, receipts, payments, expenses, contra, journal),
   balanced-entry enforcement, reversal as proper contra entry.
3. **Stage 4 — Historical backfill & reconciliation.** Post opening balances and
   existing transactions into the GL; reconcile GL vs legacy statements before
   cutover; preserve the derived reports behind a flag.
4. **Stage 5 — Reports on the GL.** Trial balance, P&L, balance sheet, cash flow,
   day book, ledger, party statements, aging, tax summary — all from journal
   lines; PDF/Excel exports.
5. **Stage 6 — Period close, audit trail, permissions.** Locking, closing
   entries, immutable audit log, accounting-specific RBAC, separation of duties.
6. **Stage 7 — Inventory & tax integration.** Proper valuation method, stock-to-
   GL linkage, VAT/TDS postings, bank accounts and reconciliation.
7. **Stage 8 — UX & polish.** COA management, voucher entry, ledger drill-down,
   bank recon UI, permission-aware navigation, performance (remove N+1).

---

## 10. Stage 1 conclusion

The current system is a well-structured reporting layer over a single-entry
ledger, not an accounting system. It cannot produce auditable books because it
has no general ledger, no chart of accounts, no vouchers, no periods, and no
audit trail, and because several of its figures are heuristics that can disagree
between engines.

The upgrade is feasible and low-risk if done additively: introduce a proper GL,
backfill and reconcile against the existing reports, then move reporting and
entry onto the GL. No existing table needs to be dropped, and the current UI can
remain in place during the transition.

Next: Stage 2 — design and implement the chart-of-accounts and general-ledger
schema (additive migration), then the posting engine.
