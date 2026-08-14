#!/usr/bin/env bash
#
# ComplianceGuard PostgreSQL restore script.
#
# Restores a custom-format pg_dump (from scripts/db-backup.sh) into the
# database. By default it drops and recreates the target database first, so a
# restore is idempotent and never merges stale rows with fresh ones.
#
# Usage:
#   ./scripts/db-restore.sh backups/complianceguard-20260814-020000.dump
#   ./scripts/db-restore.sh --dry-run backups/complianceguard-*.dump
#
# Environment variables (same defaults as db-backup.sh):
#   DB_CONTAINER   Postgres container name (default: complianceguard-db)
#   DB_USER        Postgres user (default: complianceguard)
#   DB_NAME        database name (default: complianceguard)
#
# For a host Postgres (no Docker), set DB_CONTAINER= and PGHOST/PGPORT/PGUSER.

set -euo pipefail

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
    DRY_RUN=1
    shift
fi

DUMP_FILE="${1:-}"
if [ -z "${DUMP_FILE}" ] || [ ! -f "${DUMP_FILE}" ]; then
    echo "!! Usage: $0 [--dry-run] <backup.dump>" >&2
    echo "   e.g. $0 backups/complianceguard-20260814-020000.dump" >&2
    exit 1
fi

DB_CONTAINER="${DB_CONTAINER:-complianceguard-db}"
DB_USER="${DB_USER:-${POSTGRES_USER:-complianceguard}}"
DB_NAME="${DB_NAME:-complianceguard}"

if [ -z "${PGPASSWORD:-}" ] && [ -f ".env" ]; then
    PGPASSWORD="$(grep -E '^DB_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '"')"
fi
export PGPASSWORD

if ! pg_restore --list "${DUMP_FILE}" > /dev/null 2>&1; then
    echo "!! Not a valid custom-format dump: ${DUMP_FILE}" >&2
    exit 1
fi

# Delegate commands into the container when running the Docker stack.
run_psql() {
    if [ -n "${DB_CONTAINER}" ]; then
        docker exec -e PGPASSWORD -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d postgres "$@"
    else
        psql -U "${DB_USER}" -d postgres "$@"
    fi
}
run_restore() {
    if [ -n "${DB_CONTAINER}" ]; then
        docker exec -e PGPASSWORD -i "${DB_CONTAINER}" pg_restore -U "${DB_USER}" -d "${DB_NAME}" "$@"
    else
        pg_restore -U "${DB_USER}" -d "${DB_NAME}" "$@"
    fi
}

echo "==> Restoring ${DUMP_FILE} into database '${DB_NAME}'"

# Terminate active connections so DROP DATABASE cannot be blocked.
run_psql <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
SQL

if [ "${DRY_RUN}" = "1" ]; then
    echo "==> DRY RUN — would drop/recreate '${DB_NAME}' and restore."
    exit 0
fi

run_psql -c "DROP DATABASE IF EXISTS ${DB_NAME};"
run_psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# -j 4: parallel restore (faster on multi-core hosts). --clean: drop objects
# before recreating. --if-exists: tolerate absent objects on first restore.
if run_restore -j 4 --clean --if-exists --no-owner --no-privileges < "${DUMP_FILE}"; then
    echo "==> Restore complete."
else
    echo "!! Restore finished with warnings (see above)." >&2
    exit 1
fi

# Sanity check: the alembic version table should exist after a successful restore.
VERSION_COUNT="$(run_psql -tAc "SELECT count(*) FROM ${DB_NAME}..alembic_version" 2>/dev/null || \
                 docker exec -e PGPASSWORD "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -tAc \
                   "SELECT count(*) FROM alembic_version" 2>/dev/null || echo "unknown")"
echo "==> alembic_version rows: ${VERSION_COUNT}"
