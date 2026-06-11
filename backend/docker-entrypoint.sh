#!/bin/sh
set -e

# Apply database migrations exactly once, before the multi-worker server starts,
# so the uvicorn workers don't race on `alembic upgrade head`. The in-app startup
# migration is disabled in the image via RUN_MIGRATIONS_ON_STARTUP=false.
echo "Applying database migrations..."
alembic upgrade head

exec "$@"
