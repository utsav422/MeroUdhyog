# Production deployment

## Prerequisites

- PostgreSQL reachable via `DATABASE_URL` in `backend/.env`
- Python 3.12+

## Steps

1. Copy and configure the environment:

   ```bash
   cd backend
   cp .env.example .env
   # edit DATABASE_URL, SECRET_KEY, ADMIN_SECRET_KEY, DEBUG=false
   ```

2. Install and run migrations:

   ```bash
   pip install -e .
   alembic upgrade head
   ```

3. Create the admin user (FastAdmin free version has no CLI for this):

   ```bash
   python create_admin.py
   # or with explicit credentials:
   python create_admin.py --username admin@example.com --password 'S3cure!pass'
   ```

   The script prints the generated username + password once and stores nothing.
   Re-running it resets the password of an existing matching user. The very
   first account created on a fresh database becomes the platform superadmin.

4. Start the server:

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

   Admin UI: `http://<host>:8000/admin`