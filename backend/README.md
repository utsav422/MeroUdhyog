# Factory OS — Backend

FastAPI backend for the Factory OS multi-tenant SaaS platform.

## Stack

- **FastAPI** (Python 3.11+) — API framework
- **SQLAlchemy 2.x** (async) + **psycopg[binary]** — ORM / driver
- **Alembic** — schema migrations
- **PostgreSQL** — database
- **JWT** (python-jose) + **Argon2** (passlib) — auth

## Project layout

```
backend/
├── app/
│   ├── main.py              # FastAPI entry, router wiring
│   ├── core/                # config, database, security, dependencies, logging, permissions
│   ├── modules/             # auth, tenants, users, imports, finance, audits, analytics
│   │   └── <module>/        # router.py, service.py, repository.py, models.py, schemas.py, tests/
│   ├── shared/              # tenant_repository, pagination, exceptions, models
│   └── tests/               # API-level tests
├── alembic/                 # migrations
├── alembic.ini
├── pyproject.toml
└── .env.example
```

Standard flow per domain: **Router → Service → Repository → Database**.

## Setup (local)

```bash
# 1. Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -e ".[dev]"

# 3. Configure environment
cp .env.example .env   # edit DATABASE_URL, SECRET_KEY, etc.

# 4. Create the PostgreSQL database
createdb factory_os
createdb factory_os_test

# 5. Run migrations
alembic upgrade head

# 6. Run the server
# NOTE: use ""--host localhost"" so uvicorn binds BOTH IPv4 + IPv6 (the browser
# resolves localhost to ::1 first, and the API must be reachable at localhost
# for the frontend to be considered same-site so auth cookies are stored/sent).
# Use a dedicated port (8001) to avoid conflicts with other services on 8000.
uvicorn app.main:app --reload --host localhost --port 8001
```

Open `http://localhost:8000/docs` for the interactive API docs (dev only).

## Tests

```bash
pytest                 # run all tests
pytest -q              # quiet
pytest --cov=app       # coverage
```

## Lint / type checking

```bash
ruff check app         # lint
ruff check app --fix   # auto-fix
mypy app               # type check
```

## Migrations

Create a new migration after changing models:

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```

Never edit the production schema by hand — always via a migration.
