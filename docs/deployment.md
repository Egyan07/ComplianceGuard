# Deployment Guide

This guide covers deploying ComplianceGuard's web backend + frontend to
production. The desktop (Electron) app works out of the box — no deployment
needed.

## Prerequisites

- **PostgreSQL 13+** — SQLite is fine for development but not recommended for
  production (no concurrent writes, no network access, single-process backup).
  See [migrate-sqlite-to-postgres.md](migrate-sqlite-to-postgres.md) if you're
  moving from SQLite.
- **Node.js 18+** — for the frontend build.
- **Python 3.10+** — for the backend.
- A domain with HTTPS (or a tunnel for development).

---

## Option A — Railway (One-Click)

The fastest path to a running instance:

1. Click **[Deploy on Railway](https://railway.com/new/template?template=https://github.com/Egyan07/ComplianceGuard)**
2. Railway provisions PostgreSQL + runs the backend + frontend automatically
3. Set environment variables in the Railway dashboard:

| Variable | Required | Example |
|----------|----------|---------|
| `SECRET_KEY` | ✅ | `openssl rand -hex 32` |
| `DATABASE_URL` | Auto-set | Railway fills this from the Postgres service |
| `CORS_ORIGINS` | ✅ | `["https://your-app.up.railway.app"]` |
| `ENVIRONMENT` | ✅ | `production` |
| `DEBUG` | ✅ | `false` |

4. The app is live at `https://your-app.up.railway.app`

> **Note:** Railway's free tier sleeps after inactivity. For production use,
> upgrade to a paid plan ($5/mo minimum).

---

## Option B — Docker Compose (VPS / Self-Hosted)

Best for: DigitalOcean, Hetzner, AWS EC2, or any VPS with Docker.

### 1. Clone and configure

```bash
git clone https://github.com/Egyan07/ComplianceGuard.git
cd ComplianceGuard
cp .env.example .env
```

### 2. Edit `.env`

```bash
# Required
SECRET_KEY=$(openssl rand -hex 32)
ENVIRONMENT=production
DEBUG=false

# Database — docker-compose fills DB_USER/DB_PASSWORD/DB_NAME automatically
DATABASE_URL=postgresql://complianceguard:complianceguard@db:5432/complianceguard

# CORS — set to your domain
CORS_ORIGINS=["https://complianceguard.yourdomain.com"]

# Optional: multi-worker (requires Redis)
# WORKERS=4
# RATELIMIT_STORAGE_URI=redis://redis:6379/0

# Optional: Sentry error monitoring
# SENTRY_DSN=your-sentry-dsn
```

### 3. Start

```bash
docker-compose up -d
```

The app is at `http://localhost` (nginx proxy). API docs at `http://localhost:8000/docs`.

### 4. Production hardening

| Task | How |
|------|-----|
| **HTTPS** | Place an SSL cert in `ssl/` and uncomment the HTTPS server block in `nginx.conf` |
| **Firewall** | Block ports except 80/443. PostgreSQL (5432) is localhost-only by default |
| **Backups** | Run `./scripts/db-backup.sh` nightly (cron or systemd timer) |
| **Workers** | Set `WORKERS=4` and `RATELIMIT_STORAGE_URI=redis://redis:6379/0` for multi-worker |
| **Secrets** | Use Docker secrets or a vault — never commit `.env` to version control |

---

## Option C — Render (Manual)

### 1. Create a PostgreSQL database

Render → New → PostgreSQL → note the Internal Database URL.

### 2. Create a Background Worker (backend)

- **Runtime:** Python
- **Build Command:**
  ```bash
  cd backend && pip install -r requirements.txt && alembic upgrade head
  ```
- **Start Command:**
  ```bash
  cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
  ```
- **Environment Variables:**
  ```
  DATABASE_URL=<internal-db-url>
  SECRET_KEY=<openssl rand -hex 32>
  ENVIRONMENT=production
  DEBUG=false
  CORS_ORIGINS=["https://your-app.onrender.com"]
  ```

### 3. Create a Static Site (frontend)

- **Runtime:** Static
- **Build Command:**
  ```bash
  cd frontend && npm install && VITE_API_BASE_URL=https://your-backend.onrender.com npm run build
  ```
- **Publish Directory:** `frontend/dist`

---

## Option D — Manual VPS (No Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head

# Run with systemd (see below)
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
```

### Frontend

```bash
cd frontend
npm install
VITE_API_BASE_URL=https://api.yourdomain.com npm run build
# Serve dist/ with nginx
```

### Systemd service

```ini
# /etc/systemd/system/complianceguard.service
[Unit]
Description=ComplianceGuard API
After=network.target postgresql.service

[Service]
User=complianceguard
WorkingDirectory=/opt/ComplianceGuard/backend
Environment=DATABASE_URL=postgresql://user:pass@localhost:5432/complianceguard
Environment=SECRET_KEY=<your-key>
Environment=ENVIRONMENT=production
ExecStart=/opt/ComplianceGuard/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## Database

PostgreSQL is the recommended production database. Key settings:

| Setting | Default | Notes |
|---------|---------|-------|
| `DB_POOL_SIZE` | 20 | Connections per worker |
| `DB_MAX_OVERFLOW` | 10 | Extra connections under load |
| `DB_POOL_TIMEOUT` | 30 | Seconds to wait for a connection |
| `DB_POOL_RECYCLE` | 1800 | Recycle connections every 30 min |

Total connections = `WORKERS × (DB_POOL_SIZE + DB_MAX_OVERFLOW)`. Keep this
below your PostgreSQL `max_connections` (default 100).

### Migrations

Alembic runs automatically on startup (`RUN_MIGRATIONS_ON_STARTUP=true`).
For multi-worker deployments, disable auto-migration and run it once in a
pre-start step:

```bash
# In your Dockerfile or entrypoint:
alembic upgrade head

# Then start with:
RUN_MIGRATIONS_ON_STARTUP=false uvicorn app.main:app ...
```

---

## Monitoring

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness probe — returns `{"status": "healthy"}`, database connectivity check, git SHA, uptime |
| `GET /metrics` | Prometheus scrape endpoint (request counts, latencies, build info) |

### Health check response

```json
{
  "status": "healthy",
  "service": "complianceguard-api",
  "version": "4.0.0",
  "git_sha": "65c18db",
  "database": "ok",
  "started_at": "2026-08-20T08:00:00+00:00",
  "timestamp": "2026-08-20T12:00:00+00:00"
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **"SECRET_KEY must be set via env in production"** | Set `SECRET_KEY` in your environment. Generate with `openssl rand -hex 32` |
| **"Both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together"** | Set both or neither — partial AWS config is rejected |
| **Rate limiting not working across workers** | Set `RATELIMIT_STORAGE_URI=redis://redis:6379/0` and install `redis` Python package |
| **Audit chain verification fails after DB migration** | Changing `AUDIT_HMAC_KEY` invalidates the chain. Only set it on fresh deployments |
| **"SQLite is not recommended for production use"** | Switch to PostgreSQL. See [migrate-sqlite-to-postgres.md](migrate-sqlite-to-postgres.md) |
