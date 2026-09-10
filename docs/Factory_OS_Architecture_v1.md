# Factory OS — Architecture v1

Detailed architecture reference for the Factory OS multi-tenant SaaS platform.
This is the companion to `FACTORY_OS_FULL_DOCUMENTATION.md` (product/scope/phase
plan) — this document covers schema, ERD, indexes, tenant isolation, auth/RBAC,
API design, and the testing strategy for the MVP.

---

## 1. Architecture decisions & rationale

### 1.1 Modular monolith (not microservices)

- **What**: One deployable (Next.js frontend + FastAPI backend + PostgreSQL).
- **Why**: MVP has a handful of modules and one team; microservices would add
  operational overhead (service discovery, distributed tracing, network
  failures, data consistency) with zero benefit at this scale.
- **How we keep options open**: modules are self-contained (one folder per
  domain with its own router/service/repository/models). If a module genuinely
  needs to scale independently later, it can be extracted because it already has
  a clean boundary.

### 1.2 Single transactions ledger (corrected decision)

- **What**: One `transactions` table with a `type` column (`sale` / `purchase` /
  `expense`) instead of three separate revenue/purchases/expenses tables.
- **Why**: the financial engine and audit engine both reason over one consistent
  shape of data. Three tables would duplicate every analysis and every audit rule
  three times, and make corrections/reversals awkward.

### 1.3 Cookie-based JWT (not localStorage)

- **What**: Short-lived access token (15 min) + rotating refresh token (7 days),
  both in `httpOnly`, `Secure`, `SameSite=Lax` cookies.
- **Why**: reduces XSS token-theft risk (JS cannot read the tokens).
- **Cost**: auth is cookie-based so CSRF protection is required (double-submit
  CSRF token header on state-changing requests).

### 1.4 Precomputed financial summaries

- **What**: `monthly_financial_summary` rollups recalculated after each import,
  read by the dashboard instead of aggregating raw transactions on every request.
- **Why**: keeps reads fast as tenant count and transaction volume grow, and
  keeps the dashboard deterministic.

### 1.5 No RLS / Redis / queues / microservices in the MVP

Deferred deliberately. Each has an explicit trigger condition (see §"Deferred
infrastructure" below) rather than being a silent gap.

---

## 2. Database

### 2.1 Conventions

- **UUID primary keys** on all tenant-owned tables.
- **`NUMERIC(14,2)`** for money — never floats.
- **`TIMESTAMPTZ`** (`DateTime(timezone=True)`) for all timestamps.
- **`VARCHAR + CHECK constraints`** instead of native enums so status/severity
  values can evolve without painful enum migrations.
- **Tenant-scoped uniqueness** (`UNIQUE(tenant_id, email)`), global uniqueness
  only for genuinely global concepts (`tenants.slug`).
- All schema changes through Alembic migrations. No manual DDL on production.

### 2.2 ERD (MVP)

```
tenants ──1:N── users
tenants ──1:N── customers
tenants ──1:N── products
tenants ──1:N── import_batches ──1:N── import_row_errors
tenants ──1:N── transactions ──N:1(optional)── customers
tenants ──1:N── transactions ──N:1(optional)── products
transactions ──1:1(optional, self-ref)── transactions   (correction/reversal)
tenants ──1:N── monthly_financial_summary
tenants ──1:N── audit_runs ──1:N── audit_findings ──N:1(optional)── transactions
tenants ──1:N── activity_logs
```

### 2.3 Initial schema (Phase 2 = auth + multi-tenancy)

**tenants**

| column | type | notes |
|---|---|---|
| id | UUID PK | |
| name | varchar(200) | |
| slug | varchar(100) | unique |
| is_active | bool | default true |
| created_at / updated_at | timestamptz | |

**users**

| column | type | notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | index |
| email | varchar(255) | unique(tenant_id, email) |
| hashed_password | varchar(255) | Argon2 |
| full_name | varchar(200) | |
| role | varchar(20) | CHECK in (owner, admin, accountant, viewer) |
| status | varchar(20) | CHECK in (active, inactive, invited) |
| is_active | bool | |
| last_login_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | |

**refresh_tokens**

| column | type | notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| user_id | UUID FK → users | index |
| token_hash | varchar(255) | sha256 of the raw refresh token |
| expires_at | timestamptz | |
| revoked_at | timestamptz | nullable |
| created_at | timestamptz | |

### 2.4 Indexes

- `users(tenant_id)`, unique `users(tenant_id, email)`
- `refresh_tokens(user_id)`, `refresh_tokens(expires_at)`
- (Phase 3+) `import_batches(tenant_id)`, `import_row_errors(import_batch_id)`,
  `transactions(tenant_id, transaction_date)`, `transactions(tenant_id, external_id)`,
  `transactions(tenant_id, type)`, `audit_findings(tenant_id, status, severity)`,
  `audit_findings(rule_code)`, `monthly_financial_summary(tenant_id, month)`.

---

## 3. Multi-tenancy

- Tenant identity is derived **server-side** from the authenticated token only —
  never from a URL param, body, or query string.
- Every tenant-owned table carries `tenant_id`.
- Every repository method requires `tenant_id` explicitly
  (`TenantScopedRepository` in `app/shared/tenant_repository.py`).
- A `tenant_id` from the token is always ANDed into every query, so a user can
  never read/write another tenant's rows even if an ID is guessed.
- The app connects to Postgres as a **restricted role** so RLS can be added later
  without reworking connection setup.
- **Isolation is tested**: cross-tenant access must fail for every endpoint.

---

## 4. Authentication & RBAC

- **Password hashing**: Argon2 via passlib.
- **Access token**: JWT HS256, 15 min. **Refresh token**: JWT, 7 days, rotated on
  each refresh; stored as a hash in `refresh_tokens` so a stolen DB dump exposes
  no usable tokens.
- Both tokens live in `httpOnly` cookies; `SameSite=Lax`; `Secure` in production.
- **CSRF**: a CSRF token is issued at login, stored in a non-httpOnly cookie, and
  must be echoed back in the `X-CSRF-Token` header on state-changing requests.
- **Rate limiting** on login to blunt brute force.
- **Roles**: `owner`, `admin`, `accountant`, `viewer`. A code-level permission
  map (`app/core/permissions.py`) drives a `require_permission(...)` FastAPI
  dependency. A DB-backed permissions table is deferred until CRM/Orders
  introduce more actor types.

---

## 5. API architecture

Versioned REST, one prefix per domain under `/api/v1`:

```
/api/v1/auth        register, login, logout, refresh, me
/api/v1/tenants     current tenant info only
/api/v1/users       CRUD, tenant-scoped, role-gated
/api/v1/imports     upload, batch status, row errors (Phase 3)
/api/v1/finance     summary, trends, profitability (Phase 4)
/api/v1/audits      findings, resolve/waive, trigger run (Phase 5)
/api/v1/analytics   aggregated dashboard payload (Phase 6)
```

Conventions: hard-capped pagination on every list endpoint; consistent error
shape `{code, message, details}`; `401` unauthenticated, `403` wrong tenant/role;
no stack traces in responses.

---

## 6. Testing strategy

| Layer | What | Tooling |
|---|---|---|
| Backend unit | Financial calcs, each audit rule (positive + negative) | pytest |
| Backend integration | API endpoints against a real test DB | pytest + httpx ASGITransport |
| Tenant isolation | Every endpoint, two tenants, cross-access must fail | pytest dedicated suite |
| Frontend unit | Critical components, form validation | Vitest + Testing Library |
| E2E | Login → import → financials → audit → dashboard | Playwright |
| CI | Lint + tests + `alembic check` on every PR | GitHub Actions |

---

## 7. Deferred infrastructure & triggers

| Item | Deferred because | Introduce when |
|---|---|---|
| Row-Level Security (RLS) | app-role isolation is enforced in code | before multi-instance deploy / stronger hardening |
| Redis / cache | MVP load is low | dashboard/aggregations exceed single-DB response budget |
| Background job queue | imports are small at pilot scale | large files / long-running recalcs |
| WebSockets | no real-time need yet | live GPS/delivery (Phase 18+) |
| Permissions table (DB) | fixed MVP roles suffice | CRM/Orders add more actor types |
| Microservices | MVP is one bounded domain | a module genuinely needs independent scale |
| Elasticsearch | small data | full-text search across many records |
| Object storage | single instance / local disk | running >1 app instance or large file retention |
| Connection pooler (PgBouncer) | app pool is enough | >~200 concurrent connections |

---

## 8. Security notes

- Argon2 hashing; httpOnly/Secure/SameSite cookies; CSRF double-submit.
- Pydantic input validation everywhere; file uploads validated by content.
- Least-privilege Postgres role; secrets via env vars (upgrade path to a secrets
  manager before production).
- Structured logs with no sensitive data (no passwords/tokens/reverse tenant data).
- Error responses never leak stack traces.
