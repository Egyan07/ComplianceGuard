# ComplianceGuard Backend Dockerfile
# Build context: repo root (docker-compose build context: ., Railway: repo root)
# so that shared/constants.json (the cross-repo single source of truth) is
# available to the app at runtime.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Migrations are applied once by docker-entrypoint.sh before the workers
    # start, so the in-app per-worker startup migration must stay off (else the
    # 4 uvicorn workers race on `alembic upgrade head`).
    RUN_MIGRATIONS_ON_STARTUP=false

WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        curl \
        postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy application code, migrations, and the shared constants source
COPY backend/app/ ./app/
COPY backend/migrations/ ./migrations/
COPY backend/alembic.ini .
COPY backend/docker-entrypoint.sh .
COPY shared/ ./shared/
RUN chmod +x docker-entrypoint.sh

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
# Single worker by default: the in-memory rate limiter must not be multiplied
# across workers. Scale out with WORKERS>1 AND RATELIMIT_STORAGE_URI set.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers \"${WORKERS:-1}\""]
