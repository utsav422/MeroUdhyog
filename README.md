# Factory OS

A multi-tenant SaaS platform for small and medium-sized factories. Turns raw
historical factory data (sales, purchases, expenses) into reliable, explainable
financial and audit intelligence.

**Positioning**: Audit assistance and financial intelligence — not a replacement
for a licensed auditor/accountant.

---

## Repository structure

```
factory-os/
├── backend/     # FastAPI + SQLAlchemy + Alembic + PostgreSQL
├── frontend/    # Next.js + TypeScript + Tailwind (App Router)
├── docs/        # architecture, product, roadmap, ADRs
├── .gitignore
└── README.md
```

## Phase 1 — Foundation (done)

- Backend project skeleton (FastAPI, modular structure, core + shared modules)
- Native PostgreSQL setup (no Docker), SQLAlchemy async engine
- Alembic wired with initial migration (tenants, users, refresh_tokens) plus
  the products catalog migration (products, product_variants, variant_prices)
- `/health` endpoint
- Products module (create/read/update/delete with variants + variant prices),
  tenant-scoped, gated on `MANAGE_CATALOG` for writes
- Auth/tenants/users routers scaffolded (implemented in Phase 2)
- Frontend scaffold (Next.js + TypeScript + Tailwind App Router) with an API
  client (cookie auth + CSRF) and landing/login/register/products pages
- Lint (ruff, eslint) + tests (pytest) passing

### Run the frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # points at http://localhost:8000/api/v1
npm run dev
```

Open `http://localhost:3000`. The backend must be running on port 8000
(`cd backend && uvicorn app.main:app --reload --port 8000`).

## Fast start

Create a virtual environment in `backend/` and install:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

DB setup and run instructions are in `backend/README.md`.

---

## Roadmap (short)

| Phase | Scope |
|---|---|
| 1 (done) | Foundation: repo, backend skeleton, Postgres, Alembic, `/health` |
| 2 | Authentication + multi-tenancy (cookie JWT, CSRF, tenant-isolation tests) |
| 3 | Data ingestion (CSV/XLSX → normalized `transactions` ledger) |
| 4 | Financial engine (revenue/COGS/profit, monthly summaries) |
| 5 | Audit engine (deterministic rules, findings with evidence) |
| 6 | Dashboard + reports |
| 7 | Real factory validation |

Beyond the MVP: CRM → Orders → Inventory → Production → HR → Payroll →
Delivery → GPS/Maps → Advanced analytics → AI → Billing → 50+ tenant scale.

See `docs/` for the full single-source-of-truth documentation.
