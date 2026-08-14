#!/usr/bin/env bash
#
# ComplianceGuard PostgreSQL backup script.
#
# Dumps the database with pg_dump (custom format) into a timestamped file,
# verifies the dump is readable, and prunes backups older than RETENTION_DAYS.
#
# Usage:
#   ./scripts/db-backup.sh                          # uses defaults (docker compose)
#   BACKUP_DIR=/srv/backups ./scripts/db-backup.sh  # custom destination
#
# Environment variables (all optional, sane defaults for the docker-compose stack):
#   BACKUP_DIR       where dumps are stored (default: ./backups)
#   RETENTION_DAYS   keep backups this many days (default: 14)
#   DB_CONTAINER     Postgres container name (default: complianceguard-db)
#   DB_USER          Postgres user (default: from env or complianceguard)
#   DB_NAME          database name (default: complianceguard)
#
# For a remote/host Postgres (no Docker), set PGHOST/PGPORT/PGUSER/PGPASSWORD
# and DB_CONTAINER= (empty) — the script will use the local `pg_dump` client.
#
# Recommended cron (nightly):
#   15 2 * * * cd /opt/complianceguard && ./scripts/db-backup.sh >> /var/log/cg-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-complianceguard-db}"
DB_USER="${DB_USER:-${POSTGRES_USER:-complianceguard}}"
DB_NAME="${DB_NAME:-complianceguard}"

# Read password from env if the container has it baked in, else .env file.
if [ -z "${PGPASSWORD:-}" ] && [ -f ".env" ]; then
    PGPASSWORD="$(grep -E '^DB_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '"')"
fi
export PGPASSWORD

mkdir -p "${BACKUP_DIR}"

STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/complianceguard-${STAMP}.dump"
LATEST_LINK="${BACKUP_DIR}/latest.dump"

echo "==> Backing up ${DB_NAME} to ${DUMP_FILE}"

if [ -n "${DB_CONTAINER}" ]; then
    # Docker stack: run pg_dump inside the container so version mismatches
    # between the client and server are impossible.
    docker exec -e PGPASSWORD "${DB_CONTAINER}" pg_dump \
        -U "${DB_USER}" -d "${DB_NAME}" -Fc \
        > "${DUMP_FILE}"
else
    # Host Postgres: requires pg_dump >= server version on PATH.
    pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc > "${DUMP_FILE}"
fi

# Verify the dump is a valid custom-format archive (cheap; no DB required).
if ! pg_restore --list "${DUMP_FILE}" > /dev/null 2>&1; then
    echo "!! Backup verification FAILED — removing corrupt dump" >&2
    rm -f "${DUMP_FILE}"
    exit 1
fi

# Atomic latest pointer so restores always grab the most recent good dump.
ln -sf "$(basename "${DUMP_FILE}")" "${LATEST_LINK}"

SIZE="$(du -h "${DUMP_FILE}" | cut -f1)"
echo "==> Backup OK: ${DUMP_FILE} (${SIZE})"

# Retention: prune dumps older than RETENTION_DAYS.
PRUNED=0
while IFS= read -r old; do
    rm -f "${old}"
    PRUNED=$((PRUNED + 1))
done < <(find "${BACKUP_DIR}" -name 'complianceguard-*.dump' -mtime "+${RETENTION_DAYS}" 2>/dev/null)
if [ "${PRUNED}" -gt 0 ]; then
    echo "==> Pruned ${PRUNED} backup(s) older than ${RETENTION_DAYS} days"
fi

echo "==> Done"
