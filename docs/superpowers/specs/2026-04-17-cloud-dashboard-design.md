# Cloud Dashboard — Multi-Machine Monitoring
**Date:** 2026-04-17
**Version target:** 2.9.0
**Feature tier:** Pro / Enterprise only

---

## Overview

The Cloud Dashboard allows a Pro or Enterprise user to monitor all their Windows machines from a single centralized web view. Each machine runs the existing Electron desktop app, which gains a "Sync to Cloud" button. When clicked, the Electron app authenticates with the user's web account and POSTs a compliance snapshot. The web dashboard aggregates these snapshots into a fleet overview with per-machine status.

This is the "Cloud sync + multi-machine dashboard" item from the README roadmap.

---

## Machine Limits (from existing pricing table)

| Tier       | Max Machines |
|------------|--------------|
| Free       | 1            |
| Pro        | 10           |
| Enterprise | Unlimited    |

Limit is enforced at sync time. A machine that tries to sync when the user is already at their limit receives HTTP 402 with a clear error message.

---

## Architecture

```
Electron (each Windows PC)        Web API (backend)              Web Dashboard (frontend)
──────────────────────────        ─────────────────              ───────────────────────
Settings > Cloud Sync tab         POST /api/v1/machines/sync     /cloud-dashboard page
  enter server URL + creds   →    - JWT auth                     Fleet stats header (4 cards)
  click Connect                   - upsert machine by            Machine list table
  stores JWT via electron-store     (user_id, hostname)          Pro-gated (UpgradePrompt)
                                  - enforce machine limit
Dashboard > Sync to Cloud    →    GET /api/v1/machines
  reads local SQLite score        GET /api/v1/machines/fleet-stats
  POSTs snapshot to API
  shows success/error toast
```

**Auth mechanism:** JWT-based. The Electron app calls the existing `POST /api/auth/login` endpoint, stores the access + refresh tokens in `electron-store`. Refresh is handled automatically using the existing refresh token infrastructure from v2.8.0. No new auth system required.

---

## Data Model

### New table: `machines`

| Column           | Type     | Notes                                            |
|------------------|----------|--------------------------------------------------|
| id               | UUID     | Primary key                                      |
| user_id          | UUID     | FK → users.id, not null                         |
| hostname         | String   | Not null                                         |
| os_version       | String   | Nullable                                         |
| last_score       | Float    | Nullable, 0–100                                  |
| compliance_level | String   | Nullable: "compliant" / "at_risk" / "critical"  |
| evidence_count   | Integer  | Nullable                                         |
| agent_version    | String   | Nullable                                         |
| last_sync_at     | DateTime | Nullable (null = never synced)                  |
| is_active        | Boolean  | Default True                                     |
| created_at       | DateTime | Server default now()                             |

**Unique constraint:** `(user_id, hostname)` — one row per machine per user. Re-syncing the same hostname performs an UPDATE (upsert).

**Why `user_id` not `company_id`?** Company is optional in the current User model. Anchoring to `user_id` works for both solo users and company users without requiring company setup.

One Alembic migration creates this table.

---

## API Endpoints

### `POST /api/v1/machines/sync`
- **Auth:** `get_current_user` (any authenticated user)
- **Request body:**
  ```json
  {
    "hostname": "REDPARROT-01",
    "os_version": "Windows 11 Pro",
    "overall_score": 84.5,
    "compliance_level": "compliant",
    "evidence_count": 127,
    "agent_version": "2.9.0"
  }
  ```
- **Logic:**
  1. Count existing `is_active` machines for `current_user.id`
  2. If new hostname: check limit → HTTP 402 if exceeded
  3. Upsert machine by `(user_id, hostname)`
- **Response:**
  ```json
  { "machine_id": "uuid", "hostname": "REDPARROT-01", "synced_at": "2026-04-17T10:00:00Z" }
  ```
- **Errors:** `402` machine limit reached, `422` validation error

### `GET /api/v1/machines`
- **Auth:** `require_pro`
- **Returns:** List of machines for `current_user`, ordered by `last_sync_at` desc (nulls last)
- **Fields per machine:** `id`, `hostname`, `os_version`, `last_score`, `compliance_level`, `evidence_count`, `last_sync_at`, `is_active`, `created_at`

### `GET /api/v1/machines/fleet-stats`
- **Auth:** `require_pro`
- **Returns:**
  ```json
  {
    "total_machines": 17,
    "compliant": 14,
    "at_risk": 2,
    "critical": 1,
    "never_synced": 1,
    "avg_score": 84.2,
    "machine_limit": 10
  }
  ```
  - `avg_score` excludes machines with null score
  - `machine_limit`: `1` (free), `10` (pro), `null` (enterprise = unlimited)
  - `never_synced`: count of machines where `last_sync_at` is null

---

## Frontend

### New component: `CloudDashboard.tsx`

**Route:** `/cloud-dashboard` (web mode only — hidden in Electron mode)

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Cloud Dashboard                    [↻ Refresh]       │
├────────────┬────────────┬────────────┬──────────────┤
│ 17 Total   │ 14 ✅      │ 2 ⚠️       │ 1 🔴         │
│ Machines   │ Compliant  │ At Risk    │ Critical     │
│  10 limit  │ Avg: 84%   │            │              │
└────────────┴────────────┴────────────┴──────────────┘

┌──────────────────┬────────┬─────────────┬──────────┐
│ Machine          │ Score  │ Last Sync   │ Status   │
├──────────────────┼────────┼─────────────┼──────────┤
│ REDPARROT-01     │  91%   │ 2 hrs ago   │ ✅       │
│ REDPARROT-02     │  45%   │ 1 day ago   │ ⚠️       │
│ REDPARROT-03     │  12%   │ 3 days ago  │ 🔴       │
│ REDPARROT-04     │   —    │ Never       │ —        │
└──────────────────┴────────┴─────────────┴──────────┘
```

**Behaviour:**
- Free tier → renders `UpgradePrompt` instead of the page
- Machines not synced in >7 days show a stale badge in the Last Sync column
- Never-synced machines show `—` for score and status
- Refresh button re-fetches both fleet-stats and machine list
- Machine limit shown in the Total card (e.g., "10 limit" for Pro, "Unlimited" for Enterprise)

### Changes to `App.tsx`
- New route `/cloud-dashboard` → `<CloudDashboard />`
- New sidebar nav item "Cloud Dashboard" — visible in web mode only

---

## Electron Changes

### New file: `electron/cloud-sync.js`
Responsible for:
1. `login(serverUrl, email, password)` → calls `POST /api/auth/login`, stores tokens via `electron-store`
2. `syncToCloud(serverUrl)` → reads latest score from SQLite, POSTs to `POST /api/v1/machines/sync`
3. `getCloudConfig()` → returns stored `{ serverUrl, email, connected: bool }`
4. `clearCloudConfig()` → removes stored tokens and URL

### Changes to `electron/main.js`
New IPC handlers:
- `ipcMain.handle('cloud-connect', ...)` → calls `cloudSync.login(...)`
- `ipcMain.handle('cloud-sync', ...)` → calls `cloudSync.syncToCloud(...)`
- `ipcMain.handle('cloud-get-config', ...)` → calls `cloudSync.getCloudConfig()`
- `ipcMain.handle('cloud-disconnect', ...)` → calls `cloudSync.clearCloudConfig()`

### Changes to `electron/preload.js`
Expose new IPC bridge methods under `window.electronAPI`:
- `cloudConnect(serverUrl, email, password)`
- `cloudSync()`
- `cloudGetConfig()`
- `cloudDisconnect()`

### Changes to `frontend/src/components/Settings.tsx`
New "Cloud Sync" tab (Electron mode only):
- Server URL input
- Email + Password inputs
- Connect / Disconnect button
- Status line: "Connected as you@company.com" or "Not connected"

### Changes to `frontend/src/components/Dashboard.tsx`
- "Sync to Cloud" button (Electron mode only, shown only when cloud sync is configured)
- On click: calls `window.electronAPI.cloudSync()`, shows success/error snackbar

---

## Testing

### Backend — `backend/tests/unit/test_machines.py` (~11 tests)
- `test_sync_registers_new_machine`
- `test_sync_updates_existing_machine` (upsert — same hostname)
- `test_sync_free_tier_blocks_at_2nd_machine`
- `test_sync_pro_tier_blocks_at_11th_machine`
- `test_sync_enterprise_tier_unlimited`
- `test_get_machines_requires_pro`
- `test_get_machines_returns_user_machines_only`
- `test_fleet_stats_counts_correct`
- `test_fleet_stats_avg_score_excludes_null`
- `test_fleet_stats_requires_pro`
- `test_fleet_stats_never_synced_count`

### Frontend — `frontend/src/components/CloudDashboard.test.tsx` (~6 tests)
- `renders fleet stats cards correctly`
- `renders machine list with correct status badges`
- `shows UpgradePrompt for free tier user`
- `shows stale warning for machine not synced in 7+ days`
- `shows dash for never-synced machine score`
- `refresh button re-fetches data`

**Total new tests: ~17** — brings project from 294 → ~311

---

## Version & Docs Impact

- **Version bump:** 2.8.0 → 2.9.0
- **README:** Remove "Coming soon" from cloud dashboard row in pricing table; update limitations section; update test count badge; add to Done column in roadmap
- **CHANGELOG:** New `[2.9.0]` entry
- **`.env.example`:** No new env vars needed (Electron stores its own config)
- **package.json / frontend/package.json / App.tsx / Settings.tsx:** Version references updated

---

## Out of Scope (Phase 2+)

- Per-machine drill-down (click machine → see its 29 control scores)
- Machine removal / deactivation from dashboard
- Stale machine auto-deactivation (e.g., no sync in 30 days)
- Machine API keys (alternative to JWT sync)
- Email alerts when a machine goes critical
