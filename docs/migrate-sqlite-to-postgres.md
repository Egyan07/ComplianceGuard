# Migrating from SQLite to PostgreSQL

Many users start ComplianceGuard with SQLite (the default) for local development
and need to migrate to PostgreSQL for production. This guide covers the migration.

## Why PostgreSQL for Production?

| | SQLite | PostgreSQL |
|---|---|---|
| **Concurrent writes** | Single-writer (WAL mode helps) | True concurrent access |
| **Network access** | File-based, local only | Remote connections |
| **Backups** | File copy (risky with WAL) | `pg_dump` (consistent snapshots) |
| **Multi-worker** | Not safe (file locking) | Full support |
| **Rate limiting** | In-memory only | Redis-backed shared counters |
| **Scaling** | Single machine | Connection pooling, replication |

SQLite is fine for development, testing, and single-user desktop mode.
PostgreSQL is required for any production web deployment.

## Migration Steps

### 1. Export from SQLite

ComplianceGuard includes a migration script:

```bash
cd backend
python -m scripts.migrate_sqlite_to_postgres \
  --sqlite-path ./complianceguard.db \
  --postgres-url "postgresql://user:password@localhost:5432/complianceguard"
```

If the script isn't available, use the manual approach below.

### 2. Manual Export/Import

#### Export SQLite data

```bash
# Install pgloader (recommended) or use CSV export
pip install pgloader  # or: apt install pgloader

# pgloader handles the schema + data in one step
pgloader sqlite:///complianceguard.db postgresql://user:password@localhost:5432/complianceguard
```

#### Or export to CSV

```bash
cd backend
python -c "
import sqlite3, csv, os

db = sqlite3.connect('complianceguard.db')
cursor = db.cursor()

# Get all tables
cursor.execute(\"SELECT name FROM sqlite_master WHERE type='table'\")
tables = [row[0] for row in cursor.fetchall()]

for table in tables:
    cursor.execute(f'SELECT * FROM {table}')
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()

    os.makedirs('migration_csv', exist_ok=True)
    with open(f'migration_csv/{table}.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        writer.writerows(rows)

    print(f'Exported {len(rows)} rows from {table}')
db.close()
"
```

### 3. Set up PostgreSQL

```bash
# Create the database
createdb complianceguard

# Run Alembic migrations to create the schema
cd backend
DATABASE_URL="postgresql://user:password@localhost:5432/complianceguard" \
  alembic upgrade head
```

### 4. Import data

If you used pgloader, you're done. If you exported to CSV:

```python
# Import CSV data into PostgreSQL
import psycopg2
import csv
import os

conn = psycopg2.connect("postgresql://user:password@localhost:5432/complianceguard")
cur = conn.cursor()

for table in os.listdir('migration_csv'):
    if not table.endswith('.csv'):
        continue
    table_name = table[:-4]

    with open(f'migration_csv/{table}') as f:
        reader = csv.reader(f)
        headers = next(reader)
        columns = ', '.join(headers)
        placeholders = ', '.join(['%s'] * len(headers))

        for row in reader:
            # Skip rows that would violate constraints
            try:
                cur.execute(
                    f'INSERT INTO {table_name} ({columns}) VALUES ({placeholders})',
                    row
                )
            except Exception as e:
                print(f'Skipped row in {table_name}: {e}')
                conn.rollback()
                continue

    conn.commit()
    print(f'Imported {table_name}')

conn.close()
```

### 5. Update environment

```bash
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/complianceguard
ENVIRONMENT=production
```

### 6. Verify

```bash
# Start the backend
uvicorn app.main:app --reload --port 8000

# Check health
curl http://localhost:8000/health
# Should show: "database": "ok"

# Check data
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/evidence/summary
```

## Desktop Mode (Electron)

The desktop app uses SQLite exclusively — no migration needed. SQLite is the
right choice for the desktop app because:

- Single-user, single-process
- File-based (no server dependency)
- Works offline / air-gapped
- Backup via `better-sqlite3`'s online backup API (WAL-safe)

If you sync desktop data to the web dashboard (Cloud Sync), the data flows
through the API and lands in PostgreSQL automatically.

## Rollback

If something goes wrong, the SQLite file is untouched. Simply revert your
`.env`:

```bash
DATABASE_URL=sqlite:///./complianceguard.db
```

The original SQLite database remains as a safety net until you've verified
the PostgreSQL deployment is working correctly.
