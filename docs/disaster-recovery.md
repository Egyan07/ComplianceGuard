# Disaster Recovery Runbook

This document covers backup, restore, and recovery procedures for the
ComplianceGuard backend + PostgreSQL database. It is written for the person
holding the pager at 3 AM, so every command is copy-paste ready.

## TL;DR

| Question | Answer |
| :--- | :--- |
| Where do backups go? | `./backups/complianceguard-<timestamp>.dump` (custom format) |
| How often? | Nightly via cron (RPO = 24h) |
| How long kept? | 14 days by default (`RETENTION_DAYS`) |
| How to restore? | `./scripts/db-restore.sh backups/latest.dump` |
| RTO target | < 30 minutes (single command + health check) |
| RPO target | ≤ 24 hours (nightly), ≤ 5 min if you add WAL archiving |

## Architecture

- **Database**: PostgreSQL 15 in Docker (`complianceguard-db` container),
  schema managed by Alembic migrations.
- **Application state**: everything lives in Postgres (users, evaluations,
  evidence, audit log, license state, enterprise config). There is **no**
  other durable store — if the DB survives, the app state survives.
- **Backup format**: `pg_dump -Fc` (custom-format). Compressed, restorable
  with `pg_restore`, and usable with `--clean` for idempotent restores.

## Backing up

```bash
# One-off backup
./scripts/db-backup.sh

# Custom location / retention
BACKUP_DIR=/srv/backups RETENTION_DAYS=30 ./scripts/db-backup.sh
```

The script:

1. Dumps with `pg_dump -Fc` (run inside the container for version safety).
2. **Verifies** the dump with `pg_restore --list` before declaring success —
   a corrupt backup is deleted, not kept.
3. Maintains `backups/latest.dump` as a symlink to the newest good dump.
4. Prunes dumps older than `RETENTION_DAYS`.

### Nightly cron

```cron
15 2 * * * cd /opt/complianceguard && ./scripts/db-backup.sh >> /var/log/cg-backup.log 2>&1
```

Verify it actually ran (and produced a *valid* dump):

```bash
ls -lh backups/ | tail -3
pg_restore --list backups/latest.dump | head -3   # should print TOC entries
```

### Off-site copies

Local dumps protect against accidental deletion, not against losing the
host. Copy `backups/latest.dump` off-site (S3/R2/B2/rsync to another box):

```bash
# Example: rclone to an S3 bucket (install rclone, configure remote "s3:")
rclone copy backups/latest.dump s3:complianceguard-backups/ --immutable
```

If you use the AWS integration already in the product, an S3 backup bucket
fits the existing IAM story.

## Restoring

```bash
# Dry run first — prints what would happen without touching anything
./scripts/db-restore.sh --dry-run backups/latest.dump

# Real restore: drops + recreates the target DB, then restores
./scripts/db-restore.sh backups/latest.dump
```

What the restore does:

1. Validates the dump is a real custom-format archive.
2. Terminates active connections to the target DB (so `DROP DATABASE` can't
   be blocked by a stuck session).
3. `DROP DATABASE` + `CREATE DATABASE` (idempotent — never merges old +
   new rows).
4. `pg_restore -j 4 --clean --if-exists --no-owner --no-privileges`.
5. Sanity-checks that `alembic_version` exists after restore.

> **Warning**: restoring overwrites the current database. Any data written
> since the backup was taken is lost — that is the RPO trade-off.

### Restoring to a different host (full DR)

1. Stand up Postgres: `docker compose up -d db`
2. Create the role if missing:
   ```bash
   docker exec -e PGPASSWORD -i complianceguard-db psql -U complianceguard -d postgres \
     -c "CREATE ROLE complianceguard WITH LOGIN SUPERUSER PASSWORD '...'"
   ```
3. Restore: `./scripts/db-restore.sh backups/latest.dump`
4. Start the app: `docker compose up -d`
5. Verify: `curl -sf http://localhost:8000/health | grep '"status":"healthy"'`

### Point-in-time recovery (optional)

`pg_dump` backups are point-in-time snapshots. For sub-daily RPO, enable WAL
archiving (Postgres `archive_mode=on` + `archive_command` to object storage)
and restore with `pg_basebackup` + `recovery.conf` / `recovery_target_time`.
This is a bigger setup; it is only needed if 24h RPO is unacceptable.

## Testing the DR plan

A backup you have never restored is a guess, not a plan. Run a restore drill
at least quarterly (monthly is better):

```bash
# On a scratch host/container (NEVER production):
docker compose up -d db
./scripts/db-restore.sh backups/latest.dump
# Verify data:
docker exec complianceguard-db psql -U complianceguard -d complianceguard \
  -c "SELECT count(*) FROM users; SELECT count(*) FROM audit_log;"
```

Record the drill (date, duration, RPO met?) in this repo's changelog or an
ops log so the runbook stays honest.

## Recovery checklist

- [ ] Identify the backup to restore from (newest verified = `latest.dump`)
- [ ] Confirm the target environment is isolated (not production, unless this IS the incident)
- [ ] `./scripts/db-restore.sh --dry-run backups/latest.dump`
- [ ] Run the real restore; watch for `pg_restore` errors
- [ ] Verify `alembic_version` is non-empty
- [ ] Start the app; confirm `/health` reports `"database": "ok"`
- [ ] Spot-check data: latest user, latest evaluation, audit log tail
- [ ] If restoring because of an incident: rotate DB credentials afterward
