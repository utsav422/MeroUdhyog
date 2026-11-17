# Production deployment (Contabo / Ubuntu)

This guide targets the live Contabo layout:

- `meroudhyog.com` + `www.meroudhyog.com` → Astro marketing website (static)
- `app.meroudhyog.com` → Next.js app (`127.0.0.1:3000`)
- `api.meroudhyog.com` → FastAPI (`127.0.0.1:8000`)
- PostgreSQL on the same host
- Nginx terminating TLS
- repo at `/opt/factorycrm`
- service user `factory`

DNS must have `A` records for `@`, `www`, `app`, and `api` pointing at the
Contabo VPS IP. Only ports `22`, `80`, and `443` should be public. Do not expose
`3000` or `8000`.

## 1. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx postgresql postgresql-contrib \
  python3.12 python3.12-venv python3.12-dev python3-pip build-essential curl ufw

# Node.js 22 LTS (Next.js 16 requires Node 20.9+)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

If the VPS is Ubuntu 22.04 and Python 3.12 is unavailable:

```bash
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3.12-dev
```

## 2. Service user and code

```bash
sudo adduser --system --group --home /opt/factorycrm factory
sudo mkdir -p /opt/factorycrm
sudo chown factory:factory /opt/factorycrm
sudo -u factory git clone <REPO_URL> /opt/factorycrm
```

If the repo is already on the server, skip the clone and just ensure ownership:

```bash
sudo chown -R factory:factory /opt/factorycrm
```

## 3. PostgreSQL

```bash
sudo -u postgres psql -c "CREATE USER factory WITH PASSWORD 'STRONG_DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE factorycrm OWNER factory;"
```

## 4. Backend environment

```bash
cd /opt/factorycrm/backend
sudo -u factory cp .env.example .env
sudo -u factory nano .env
```

Production values to set:

```dotenv
APP_NAME="Factory OS"
APP_ENV="production"
DEBUG=false

DATABASE_URL="postgresql://factory:STRONG_DB_PASSWORD@127.0.0.1:5432/factorycrm"
DATABASE_POOL_SIZE=5
DATABASE_MAX_OVERFLOW=10

SECRET_KEY="<openssl rand -hex 32>"
CSRF_SECRET_KEY="<openssl rand -hex 32>"

CORS_ORIGINS='["https://app.meroudhyog.com", "https://meroudhyog.com", "https://www.meroudhyog.com"]'
COOKIE_SECURE=true
FRONTEND_URL="https://app.meroudhyog.com"

# Set real SMTP values for password-reset and verification emails.
# If SMTP_HOST is empty, those links are only printed to the API logs.
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_USE_TLS=true
MAIL_FROM="Mero Udhyog <no-reply@meroudhyog.com>"

ADMIN_SECRET_KEY="<openssl rand -hex 32>"
ADMIN_SESSION_COOKIE_SECURE=true

# Optional web push
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:hello@meroudhyog.com"
```

Generate secrets with:

```bash
openssl rand -hex 32
```

Rules:

- `SECRET_KEY` must be at least 32 characters and must never be reused from dev.
- `CORS_ORIGINS` is a JSON array. Include every browser origin that calls the API directly.
- Use `COOKIE_SECURE=true` only with HTTPS.
- Never commit `.env`. The root `.gitignore` ignores `.env`; `frontend/.gitignore` ignores `.env*`.
- If a `.env` was ever committed, rotate every secret and remove it from git history.

## 5. Install backend and migrate

```bash
cd /opt/factorycrm/backend
sudo -u factory python3.12 -m venv .venv
sudo -u factory .venv/bin/pip install --upgrade pip
sudo -u factory .venv/bin/pip install -e .
sudo -u factory .venv/bin/alembic upgrade head
```

Create the FastAdmin user (re-running resets its password):

```bash
sudo -u factory .venv/bin/python create_admin.py
```

The script prints the credentials once. On a fresh database the first user
created becomes the platform superadmin. If the app already has a superadmin,
you can also register normally and skip this.

## 6. Frontend environment and build

```bash
cd /opt/factorycrm/frontend
sudo -u factory cp .env.local.example .env.production
sudo -u factory nano .env.production
```

Set:

```dotenv
NEXT_PUBLIC_API_URL=/api/v1
BACKEND_URL=http://127.0.0.1:8000
```

`BACKEND_URL` is used by the Next.js rewrites in `next.config.ts`. Set it
**before** `npm run build`. `NEXT_PUBLIC_API_URL` is also baked in at build
time, so rebuild whenever either value changes.

Keep `NEXT_PUBLIC_API_URL=/api/v1` so the browser calls `app.meroudhyog.com/api/*`
and Next.js proxies to the API server-side. This keeps the auth and CSRF
cookies on the `app.meroudhyog.com` origin. Do **not** set it to
`https://api.meroudhyog.com/api/v1` unless you also change the cookie/CORS
setup for cross-site requests.

`BACKEND_URL=http://127.0.0.1:8000` is the recommended internal path because
both services are on the same VPS. The public API remains available at
`https://api.meroudhyog.com` for direct clients.

Do not copy the local `frontend/.env`; it points at Render.

Build:

```bash
cd /opt/factorycrm/frontend
sudo -u factory npm ci
sudo -u factory npm run build
```

If the build runs out of memory on a small VPS, add swap or build on a larger
machine and copy `.next`.

### Marketing website

The Astro site is fully static:

```bash
cd /opt/factorycrm/website
sudo -u factory npm ci
sudo -u factory npm run build
```

Output is written to `/opt/factorycrm/website/dist`. Nginx serves it directly;
no Node process is required for the website.

## 7. systemd services

Create `/etc/systemd/system/factorycrm-api.service`:

```ini
[Unit]
Description=FactoryCRM API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=factory
Group=factory
WorkingDirectory=/opt/factorycrm/backend
Environment=PYTHONUNBUFFERED=1
ExecStart=/opt/factorycrm/backend/.venv/bin/uvicorn app.main:app \
  --host 127.0.0.1 --port 8000 --workers 2 \
  --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

The app loads `backend/.env` itself through pydantic-settings.

Create `/etc/systemd/system/factorycrm-web.service`:

```ini
[Unit]
Description=FactoryCRM Web
After=network.target factorycrm-api.service
Wants=factorycrm-api.service

[Service]
Type=simple
User=factory
Group=factory
WorkingDirectory=/opt/factorycrm/frontend
Environment=NODE_ENV=production
EnvironmentFile=/opt/factorycrm/frontend/.env.production
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now factorycrm-api factorycrm-web
sudo systemctl status factorycrm-api factorycrm-web
curl -fsS http://127.0.0.1:8000/health
curl -I http://127.0.0.1:3000
```

Use `--workers 1` on very small VPS instances.

## 8. Nginx and TLS

Create `/etc/nginx/sites-available/factorycrm`:

```nginx
# API: https://api.meroudhyog.com
server {
    listen 80;
    listen [::]:80;
    server_name api.meroudhyog.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}

# App: https://app.meroudhyog.com
server {
    listen 80;
    listen [::]:80;
    server_name app.meroudhyog.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}

# Marketing website: https://meroudhyog.com and https://www.meroudhyog.com
server {
    listen 80;
    listen [::]:80;
    server_name meroudhyog.com www.meroudhyog.com;

    root /opt/factorycrm/website/dist;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    error_page 404 /404.html;
}
```

Enable it and obtain certificates for all four hostnames:

```bash
sudo ln -s /etc/nginx/sites-available/factorycrm /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx \
  -d meroudhyog.com \
  -d www.meroudhyog.com \
  -d app.meroudhyog.com \
  -d api.meroudhyog.com
```

The browser uses `app.meroudhyog.com` for the app; Next.js proxies `/api/*`
and `/health` to FastAPI, so cookies stay on the app origin. The API is also
reachable directly at `https://api.meroudhyog.com`.

FastAdmin is available at `https://api.meroudhyog.com/admin` because the API
Nginx block proxies the whole backend. If you want it under the app domain,
add an `/admin` location to the `app.meroudhyog.com` block.

## 9. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 10. Existing data: backfill and readiness

Skip this on a fresh database with no transactions.

```bash
cd /opt/factorycrm/backend
sudo -u factory .venv/bin/python -m scripts.backfill_ledger --dry-run
sudo -u factory .venv/bin/python -m scripts.backfill_ledger
sudo -u factory .venv/bin/python -m scripts.cutover_readiness
```

The backfill is idempotent. Readiness must report every tenant as ready before
switching report engines.

Optional GL cutover, only after a backup and a clean readiness report:

```bash
sudo -u postgres pg_dump -Fc factorycrm > /var/backups/factorycrm-$(date +%F).dump
cd /opt/factorycrm/backend
sudo -u factory .venv/bin/python -m scripts.set_report_engine --engine gl
sudo -u factory .venv/bin/python -m scripts.set_report_engine --engine gl --apply
```

Rollback:

```bash
sudo -u factory .venv/bin/python -m scripts.set_report_engine --engine legacy --apply
```

## 11. Deploying updates

```bash
cd /opt/factorycrm
sudo -u factory git pull

cd backend
sudo -u factory .venv/bin/pip install -e .
sudo -u factory .venv/bin/alembic upgrade head

cd ../frontend
sudo -u factory npm ci
sudo -u factory npm run build

cd ../website
sudo -u factory npm ci
sudo -u factory npm run build

sudo systemctl restart factorycrm-api factorycrm-web
```

Always run migrations before restarting the API. The website is static, so its
new `dist` output is served immediately after the build.

## 12. Operations

```bash
# Logs
journalctl -u factorycrm-api -f
journalctl -u factorycrm-web -f

# Health through the public domains
curl -fsS https://app.meroudhyog.com/health
curl -fsS https://api.meroudhyog.com/health

# Database backup
sudo -u postgres pg_dump -Fc factorycrm > /var/backups/factorycrm-$(date +%F).dump
```

Set up a daily backup cron job and copy backups off the VPS. Keep `3000` and
`8000` bound to `127.0.0.1`, not `0.0.0.0`.
