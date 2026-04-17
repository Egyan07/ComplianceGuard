# Cloud Dashboard — Multi-Machine Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cloud dashboard that lets Pro/Enterprise users see all their Windows machines' compliance scores in one centralized web view, with Electron "Sync to Cloud" sending snapshots from each machine.

**Architecture:** New `machines` table stores per-machine snapshots. Three new API endpoints handle sync (any auth), list (Pro), and fleet-stats (Pro). `electron/cloud-sync.js` logs into the web server and POSTs snapshots using JWT auth already built in v2.8.0. The web frontend gets a new `CloudDashboard` page that reads fleet-stats + machine list and renders a summary header + table.

**Tech Stack:** FastAPI + SQLAlchemy (backend), Alembic (migrations), pytest + TestClient (backend tests), React + Material-UI (frontend), vitest + @testing-library/react (frontend tests), Node.js fetch (Electron, Node 18+ built-in).

---

## File Map

**Created:**
- `backend/app/models/machine.py` — Machine SQLAlchemy model
- `backend/migrations/versions/2b7e3f4a9c1d_add_machines_table.py` — Alembic migration
- `backend/app/api/machines.py` — Three API endpoints (sync, list, fleet-stats)
- `backend/tests/unit/test_machines.py` — 13 backend unit tests
- `frontend/src/components/CloudDashboard.tsx` — Fleet stats + machine list page
- `frontend/src/components/CloudDashboard.test.tsx` — 6 frontend tests
- `electron/cloud-sync.js` — Login + sync logic using Node.js fetch

**Modified:**
- `backend/app/models/__init__.py` — register Machine
- `backend/app/main.py` — include machines router, bump version 2.8.0 → 2.9.0
- `frontend/src/services/api.ts` — add FleetStats/MachineRecord interfaces + getFleetStats/getMachines functions
- `frontend/src/App.tsx` — add CloudDashboard route + nav icon, bump version
- `electron/main.js` — add 4 cloud IPC handlers
- `electron/preload.js` — expose 4 cloud methods
- `frontend/src/components/Settings.tsx` — add Cloud Sync section (Electron-only), bump version
- `frontend/src/components/Dashboard.tsx` — add Sync to Cloud button (Electron-only)
- `README.md` — promote cloud dashboard from coming soon, update test count, roadmap
- `CHANGELOG.md` — add [2.9.0] entry
- `package.json` — bump version
- `frontend/package.json` — bump version

---

## Phase 1 — Backend Data Layer

### Task 1: Machine model + Alembic migration

**Files:**
- Create: `backend/app/models/machine.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/migrations/versions/2b7e3f4a9c1d_add_machines_table.py`

- [ ] **Step 1: Create the Machine model**

`backend/app/models/machine.py`:
```python
"""
Machine model for ComplianceGuard Cloud Dashboard.

Tracks Windows endpoints that sync compliance snapshots to the web server.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class Machine(Base):
    """A Windows endpoint registered by a user for cloud sync."""

    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    hostname = Column(String, nullable=False)
    os_version = Column(String, nullable=True)
    last_score = Column(Float, nullable=True)
    compliance_level = Column(String, nullable=True)  # compliant / at_risk / critical
    evidence_count = Column(Integer, nullable=True)
    agent_version = Column(String, nullable=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "hostname", name="uq_machine_user_hostname"),
    )
```

- [ ] **Step 2: Register Machine in models `__init__.py`**

In `backend/app/models/__init__.py`, add two lines:

```python
from .machine import Machine
```

Add `"Machine"` to the `__all__` list.

After edit the file looks like:
```python
from .user import User
from .company import Company
from .compliance import ComplianceFramework
from .evidence import EvidenceCollection, EvidenceItem
from .evaluation import ComplianceEvaluationRecord, ControlAssessmentRecord
from .machine import Machine

__all__ = [
    "User",
    "Company",
    "ComplianceFramework",
    "EvidenceCollection",
    "EvidenceItem",
    "ComplianceEvaluationRecord",
    "ControlAssessmentRecord",
    "Machine",
]
```

- [ ] **Step 3: Create Alembic migration**

`backend/migrations/versions/2b7e3f4a9c1d_add_machines_table.py`:
```python
"""add_machines_table

Revision ID: 2b7e3f4a9c1d
Revises: ea55dc1219d7
Create Date: 2026-04-17 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '2b7e3f4a9c1d'
down_revision: Union[str, None] = 'ea55dc1219d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'machines',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('hostname', sa.String(), nullable=False),
        sa.Column('os_version', sa.String(), nullable=True),
        sa.Column('last_score', sa.Float(), nullable=True),
        sa.Column('compliance_level', sa.String(), nullable=True),
        sa.Column('evidence_count', sa.Integer(), nullable=True),
        sa.Column('agent_version', sa.String(), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'hostname', name='uq_machine_user_hostname'),
    )
    op.create_index('ix_machines_id', 'machines', ['id'], unique=False)
    op.create_index('ix_machines_user_id', 'machines', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_machines_user_id', table_name='machines')
    op.drop_index('ix_machines_id', table_name='machines')
    op.drop_table('machines')
```

- [ ] **Step 4: Verify import works**

```bash
cd /tmp/ComplianceGuard/backend
python -c "from app.models.machine import Machine; print('Machine model OK')"
```
Expected: `Machine model OK`

- [ ] **Step 5: Commit**

```bash
cd /tmp/ComplianceGuard
git add backend/app/models/machine.py backend/app/models/__init__.py backend/migrations/versions/2b7e3f4a9c1d_add_machines_table.py
git commit -m "feat: add Machine model and migration for cloud dashboard"
```

---

### Task 2: Backend unit tests for machines API (write first — TDD)

**Files:**
- Create: `backend/tests/unit/test_machines.py`

- [ ] **Step 1: Write all 13 tests**

`backend/tests/unit/test_machines.py`:
```python
"""Unit tests for the machines API endpoints (cloud dashboard)."""

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.machine import Machine
from app.core.auth import get_password_hash


# ---- Helpers ----

def _make_user(db: Session, email: str, tier: str) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash("testpass"),
        first_name="Test",
        last_name="User",
        is_active=True,
        license_tier=tier,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_client(db: Session, user: User) -> TestClient:
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


def _clear(client: TestClient) -> None:
    app.dependency_overrides.clear()


# ---- sync endpoint ----

def test_sync_registers_new_machine(test_db_session):
    user = _make_user(test_db_session, "sync1@test.com", "pro")
    client = _make_client(test_db_session, user)
    resp = client.post("/api/v1/machines/sync", json={
        "hostname": "PC-001",
        "os_version": "Windows 11 Pro",
        "overall_score": 85.0,
        "compliance_level": "compliant",
        "evidence_count": 100,
        "agent_version": "2.9.0",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["hostname"] == "PC-001"
    assert "machine_id" in data
    assert "synced_at" in data
    _clear(client)


def test_sync_updates_existing_machine(test_db_session):
    user = _make_user(test_db_session, "sync2@test.com", "pro")
    client = _make_client(test_db_session, user)
    client.post("/api/v1/machines/sync", json={"hostname": "PC-002", "overall_score": 70.0, "compliance_level": "at_risk"})
    resp = client.post("/api/v1/machines/sync", json={"hostname": "PC-002", "overall_score": 90.0, "compliance_level": "compliant"})
    assert resp.status_code == 200
    count = test_db_session.query(Machine).filter(
        Machine.user_id == user.id, Machine.hostname == "PC-002"
    ).count()
    assert count == 1
    _clear(client)


def test_sync_free_tier_blocks_at_2nd_machine(test_db_session):
    user = _make_user(test_db_session, "free1@test.com", "free")
    client = _make_client(test_db_session, user)
    client.post("/api/v1/machines/sync", json={"hostname": "PC-003", "overall_score": 80.0, "compliance_level": "compliant"})
    resp = client.post("/api/v1/machines/sync", json={"hostname": "PC-004", "overall_score": 80.0, "compliance_level": "compliant"})
    assert resp.status_code == 402
    _clear(client)


def test_sync_free_tier_allows_update_same_hostname(test_db_session):
    user = _make_user(test_db_session, "free2@test.com", "free")
    client = _make_client(test_db_session, user)
    client.post("/api/v1/machines/sync", json={"hostname": "PC-005", "overall_score": 70.0, "compliance_level": "at_risk"})
    resp = client.post("/api/v1/machines/sync", json={"hostname": "PC-005", "overall_score": 85.0, "compliance_level": "compliant"})
    assert resp.status_code == 200
    _clear(client)


def test_sync_pro_tier_blocks_at_11th_machine(test_db_session):
    user = _make_user(test_db_session, "pro1@test.com", "pro")
    client = _make_client(test_db_session, user)
    for i in range(10):
        r = client.post("/api/v1/machines/sync", json={"hostname": f"PRO-{100+i}", "overall_score": 80.0, "compliance_level": "compliant"})
        assert r.status_code == 200
    resp = client.post("/api/v1/machines/sync", json={"hostname": "PRO-110", "overall_score": 80.0, "compliance_level": "compliant"})
    assert resp.status_code == 402
    _clear(client)


def test_sync_enterprise_tier_unlimited(test_db_session):
    user = _make_user(test_db_session, "ent1@test.com", "enterprise")
    client = _make_client(test_db_session, user)
    for i in range(12):
        resp = client.post("/api/v1/machines/sync", json={"hostname": f"ENT-{i}", "overall_score": 80.0, "compliance_level": "compliant"})
        assert resp.status_code == 200
    _clear(client)


# ---- list endpoint ----

def test_get_machines_requires_pro(test_db_session):
    user = _make_user(test_db_session, "free3@test.com", "free")
    client = _make_client(test_db_session, user)
    resp = client.get("/api/v1/machines")
    assert resp.status_code == 402
    _clear(client)


def test_get_machines_returns_user_machines_only(test_db_session):
    user_a = _make_user(test_db_session, "usera@test.com", "pro")
    user_b = _make_user(test_db_session, "userb@test.com", "pro")
    test_db_session.add(Machine(user_id=user_a.id, hostname="A-PC-001"))
    test_db_session.add(Machine(user_id=user_b.id, hostname="B-PC-001"))
    test_db_session.commit()
    client = _make_client(test_db_session, user_a)
    resp = client.get("/api/v1/machines")
    assert resp.status_code == 200
    hostnames = [m["hostname"] for m in resp.json()]
    assert "A-PC-001" in hostnames
    assert "B-PC-001" not in hostnames
    _clear(client)


# ---- fleet-stats endpoint ----

def test_fleet_stats_counts_correct(test_db_session):
    user = _make_user(test_db_session, "stats1@test.com", "pro")
    now = datetime.now(timezone.utc)
    test_db_session.add(Machine(user_id=user.id, hostname="S-001", compliance_level="compliant", last_score=90.0, last_sync_at=now))
    test_db_session.add(Machine(user_id=user.id, hostname="S-002", compliance_level="at_risk", last_score=50.0, last_sync_at=now))
    test_db_session.add(Machine(user_id=user.id, hostname="S-003", compliance_level="critical", last_score=20.0, last_sync_at=now))
    test_db_session.commit()
    client = _make_client(test_db_session, user)
    resp = client.get("/api/v1/machines/fleet-stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_machines"] == 3
    assert data["compliant"] == 1
    assert data["at_risk"] == 1
    assert data["critical"] == 1
    assert data["never_synced"] == 0
    _clear(client)


def test_fleet_stats_avg_score_excludes_null(test_db_session):
    user = _make_user(test_db_session, "stats2@test.com", "pro")
    now = datetime.now(timezone.utc)
    test_db_session.add(Machine(user_id=user.id, hostname="N-001", last_score=80.0, compliance_level="compliant", last_sync_at=now))
    test_db_session.add(Machine(user_id=user.id, hostname="N-002", last_score=None, compliance_level=None, last_sync_at=None))
    test_db_session.commit()
    client = _make_client(test_db_session, user)
    resp = client.get("/api/v1/machines/fleet-stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["avg_score"] == 80.0
    assert data["never_synced"] == 1
    _clear(client)


def test_fleet_stats_requires_pro(test_db_session):
    user = _make_user(test_db_session, "free4@test.com", "free")
    client = _make_client(test_db_session, user)
    resp = client.get("/api/v1/machines/fleet-stats")
    assert resp.status_code == 402
    _clear(client)


def test_fleet_stats_machine_limit_pro(test_db_session):
    user = _make_user(test_db_session, "stats3@test.com", "pro")
    client = _make_client(test_db_session, user)
    resp = client.get("/api/v1/machines/fleet-stats")
    assert resp.status_code == 200
    assert resp.json()["machine_limit"] == 10
    _clear(client)


def test_fleet_stats_machine_limit_enterprise(test_db_session):
    user = _make_user(test_db_session, "stats4@test.com", "enterprise")
    client = _make_client(test_db_session, user)
    resp = client.get("/api/v1/machines/fleet-stats")
    assert resp.status_code == 200
    assert resp.json()["machine_limit"] is None
    _clear(client)
```

- [ ] **Step 2: Run tests — confirm they all fail (endpoint doesn't exist yet)**

```bash
cd /tmp/ComplianceGuard/backend
python -m pytest tests/unit/test_machines.py -v 2>&1 | tail -20
```
Expected: All 13 tests fail with 404 or import errors.

- [ ] **Step 3: Commit the test file**

```bash
cd /tmp/ComplianceGuard
git add backend/tests/unit/test_machines.py
git commit -m "test: add failing tests for machines API (TDD)"
```

---

### Task 3: Machines API endpoints + wire into main.py

**Files:**
- Create: `backend/app/api/machines.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create the machines API module**

`backend/app/api/machines.py`:
```python
"""
Machines API for ComplianceGuard Cloud Dashboard.

Endpoints for Electron desktop apps to sync compliance snapshots
and for the web dashboard to view fleet status.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone

from app.core.database import get_db
from app.api.deps import get_current_user, require_pro
from app.models.user import User
from app.models.machine import Machine

router = APIRouter(prefix="/api/v1/machines", tags=["machines"])

MACHINE_LIMITS = {
    "free": 1,
    "pro": 10,
    "enterprise": None,  # unlimited
}


class MachineSyncRequest(BaseModel):
    hostname: str = Field(..., min_length=1, max_length=255)
    os_version: Optional[str] = Field(None, max_length=255)
    overall_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    compliance_level: Optional[str] = Field(None)
    evidence_count: Optional[int] = Field(None, ge=0)
    agent_version: Optional[str] = Field(None, max_length=50)


class MachineSyncResponse(BaseModel):
    machine_id: int
    hostname: str
    synced_at: datetime


class MachineResponse(BaseModel):
    id: int
    hostname: str
    os_version: Optional[str]
    last_score: Optional[float]
    compliance_level: Optional[str]
    evidence_count: Optional[int]
    last_sync_at: Optional[datetime]
    is_active: bool
    created_at: datetime


class FleetStatsResponse(BaseModel):
    total_machines: int
    compliant: int
    at_risk: int
    critical: int
    never_synced: int
    avg_score: Optional[float]
    machine_limit: Optional[int]


@router.post("/sync", response_model=MachineSyncResponse)
async def sync_machine(
    request: MachineSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Register or update a machine compliance snapshot.
    Called by the Electron 'Sync to Cloud' button.
    Enforces per-tier machine limits on new machines.
    """
    limit = MACHINE_LIMITS.get(current_user.license_tier)

    existing_machine = (
        db.query(Machine)
        .filter(Machine.user_id == current_user.id, Machine.hostname == request.hostname)
        .first()
    )

    if existing_machine is None:
        if limit is not None:
            current_count = (
                db.query(Machine)
                .filter(Machine.user_id == current_user.id, Machine.is_active == True)
                .count()
            )
            if current_count >= limit:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Machine limit reached ({limit} for {current_user.license_tier} tier). Upgrade to add more machines.",
                )
        machine = Machine(user_id=current_user.id, hostname=request.hostname)
        db.add(machine)
    else:
        machine = existing_machine

    machine.os_version = request.os_version
    machine.last_score = request.overall_score
    machine.compliance_level = request.compliance_level
    machine.evidence_count = request.evidence_count
    machine.agent_version = request.agent_version
    machine.last_sync_at = datetime.now(timezone.utc)
    machine.is_active = True

    db.commit()
    db.refresh(machine)

    return MachineSyncResponse(
        machine_id=machine.id,
        hostname=machine.hostname,
        synced_at=machine.last_sync_at,
    )


@router.get("/fleet-stats", response_model=FleetStatsResponse)
async def get_fleet_stats(
    current_user: User = Depends(require_pro),
    db: Session = Depends(get_db),
):
    """Fleet overview stats for the cloud dashboard. Requires Pro or Enterprise."""
    machines = (
        db.query(Machine)
        .filter(Machine.user_id == current_user.id, Machine.is_active == True)
        .all()
    )

    total = len(machines)
    compliant = sum(1 for m in machines if m.compliance_level == "compliant")
    at_risk = sum(1 for m in machines if m.compliance_level == "at_risk")
    critical = sum(1 for m in machines if m.compliance_level == "critical")
    never_synced = sum(1 for m in machines if m.last_sync_at is None)

    scores = [m.last_score for m in machines if m.last_score is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else None

    limit = MACHINE_LIMITS.get(current_user.license_tier)

    return FleetStatsResponse(
        total_machines=total,
        compliant=compliant,
        at_risk=at_risk,
        critical=critical,
        never_synced=never_synced,
        avg_score=avg_score,
        machine_limit=limit,
    )


@router.get("", response_model=List[MachineResponse])
async def get_machines(
    current_user: User = Depends(require_pro),
    db: Session = Depends(get_db),
):
    """List all machines for the current user. Requires Pro or Enterprise."""
    machines = (
        db.query(Machine)
        .filter(Machine.user_id == current_user.id, Machine.is_active == True)
        .order_by(Machine.last_sync_at.desc())
        .all()
    )
    return [
        MachineResponse(
            id=m.id,
            hostname=m.hostname,
            os_version=m.os_version,
            last_score=m.last_score,
            compliance_level=m.compliance_level,
            evidence_count=m.evidence_count,
            last_sync_at=m.last_sync_at,
            is_active=m.is_active,
            created_at=m.created_at,
        )
        for m in machines
    ]
```

- [ ] **Step 2: Wire the machines router into `backend/app/main.py`**

Add the import and router include. Find the line:
```python
from app.api.compliance import router as compliance_router
```
Add after it:
```python
from app.api.machines import router as machines_router
```

Find the line:
```python
app.include_router(compliance_router)
```
Add after it:
```python
app.include_router(machines_router)
```

- [ ] **Step 3: Run tests — confirm all 13 pass**

```bash
cd /tmp/ComplianceGuard/backend
python -m pytest tests/unit/test_machines.py -v
```
Expected: 13 passed.

- [ ] **Step 4: Run full backend test suite — confirm no regressions**

```bash
cd /tmp/ComplianceGuard/backend
python -m pytest tests/unit/ tests/integration/ -v 2>&1 | tail -20
```
Expected: All existing tests still pass.

- [ ] **Step 5: Commit**

```bash
cd /tmp/ComplianceGuard
git add backend/app/api/machines.py backend/app/main.py
git commit -m "feat: add machines API endpoints for cloud dashboard sync"
```

---

## Phase 2 — Web Frontend Dashboard

### Task 4: Frontend API helpers for machines

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add FleetStats and MachineRecord interfaces + two functions**

At the end of `frontend/src/services/api.ts` (before the final export block), add:

```typescript
// ---- Cloud Dashboard types ----

export interface FleetStats {
  total_machines: number;
  compliant: number;
  at_risk: number;
  critical: number;
  never_synced: number;
  avg_score: number | null;
  machine_limit: number | null;
}

export interface MachineRecord {
  id: number;
  hostname: string;
  os_version: string | null;
  last_score: number | null;
  compliance_level: string | null;
  evidence_count: number | null;
  last_sync_at: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getFleetStats(): Promise<FleetStats> {
  const response = await apiClient.get('/machines/fleet-stats');
  return response.data;
}

export async function getMachines(): Promise<MachineRecord[]> {
  const response = await apiClient.get('/machines');
  return response.data;
}
```

Note: `apiClient` has `baseURL = 'http://localhost:8000/api/v1'` so `/machines/fleet-stats` → `http://localhost:8000/api/v1/machines/fleet-stats`. ✓

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /tmp/ComplianceGuard/frontend
npx tsc --noEmit 2>&1 | grep -E "error|Error" | head -10 || echo "clean"
```
Expected: `clean`

- [ ] **Step 3: Commit**

```bash
cd /tmp/ComplianceGuard
git add frontend/src/services/api.ts
git commit -m "feat: add getFleetStats and getMachines API helpers"
```

---

### Task 5: CloudDashboard component tests (write first — TDD)

**Files:**
- Create: `frontend/src/components/CloudDashboard.test.tsx`

- [ ] **Step 1: Write the 6 tests**

`frontend/src/components/CloudDashboard.test.tsx`:
```typescript
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CloudDashboard from './CloudDashboard';
import * as api from '../services/api';
import { useLicense } from '../contexts/LicenseContext';

vi.mock('../services/api', () => ({
  getFleetStats: vi.fn(),
  getMachines: vi.fn(),
}));

vi.mock('../contexts/LicenseContext', () => ({
  useLicense: vi.fn(),
}));

const mockFleetStats: api.FleetStats = {
  total_machines: 3,
  compliant: 2,
  at_risk: 1,
  critical: 0,
  never_synced: 0,
  avg_score: 84.2,
  machine_limit: 10,
};

const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 86_400_000).toISOString();

const mockMachines: api.MachineRecord[] = [
  { id: 1, hostname: 'PC-001', last_score: 91.0, compliance_level: 'compliant', last_sync_at: now, os_version: 'Windows 11', evidence_count: 100, is_active: true, created_at: now },
  { id: 2, hostname: 'PC-002', last_score: 45.0, compliance_level: 'at_risk', last_sync_at: yesterday, os_version: 'Windows 10', evidence_count: 80, is_active: true, created_at: now },
  { id: 3, hostname: 'PC-003', last_score: null, compliance_level: null, last_sync_at: null, os_version: null, evidence_count: null, is_active: true, created_at: now },
];

describe('CloudDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useLicense as ReturnType<typeof vi.fn>).mockReturnValue({ tier: 'pro' });
    (api.getFleetStats as ReturnType<typeof vi.fn>).mockResolvedValue(mockFleetStats);
    (api.getMachines as ReturnType<typeof vi.fn>).mockResolvedValue(mockMachines);
  });

  it('renders fleet stats cards correctly', async () => {
    render(<CloudDashboard />);
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('84.2%')).toBeInTheDocument();
    });
  });

  it('renders machine list with correct status badges', async () => {
    render(<CloudDashboard />);
    await waitFor(() => {
      expect(screen.getByText('PC-001')).toBeInTheDocument();
      expect(screen.getByText('PC-002')).toBeInTheDocument();
      expect(screen.getByText('Compliant')).toBeInTheDocument();
      expect(screen.getByText('At Risk')).toBeInTheDocument();
    });
  });

  it('shows pro gate for free tier user', () => {
    (useLicense as ReturnType<typeof vi.fn>).mockReturnValue({ tier: 'free' });
    render(<CloudDashboard />);
    expect(screen.getByText(/Cloud Dashboard.*Pro Feature/i)).toBeInTheDocument();
  });

  it('shows dash for never-synced machine score', async () => {
    render(<CloudDashboard />);
    await waitFor(() => expect(screen.getByText('PC-003')).toBeInTheDocument());
    const rows = screen.getAllByRole('row');
    const pc003Row = rows.find(r => r.textContent?.includes('PC-003'));
    expect(pc003Row?.textContent).toContain('—');
  });

  it('refresh button re-fetches data', async () => {
    render(<CloudDashboard />);
    await waitFor(() => expect(api.getFleetStats).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(api.getFleetStats).toHaveBeenCalledTimes(2));
  });

  it('shows stale warning for machine not synced in 7+ days', async () => {
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    (api.getMachines as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...mockMachines[0], last_sync_at: staleDate, hostname: 'STALE-PC' },
    ]);
    render(<CloudDashboard />);
    await waitFor(() => expect(screen.getByText('STALE-PC')).toBeInTheDocument());
    expect(screen.getByText(/stale/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail (component doesn't exist)**

```bash
cd /tmp/ComplianceGuard/frontend
npm test -- --run src/components/CloudDashboard.test.tsx 2>&1 | tail -15
```
Expected: Fail — `Cannot find module './CloudDashboard'`

- [ ] **Step 3: Commit test file**

```bash
cd /tmp/ComplianceGuard
git add frontend/src/components/CloudDashboard.test.tsx
git commit -m "test: add failing CloudDashboard component tests (TDD)"
```

---

### Task 6: CloudDashboard component + wire into App.tsx

**Files:**
- Create: `frontend/src/components/CloudDashboard.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create the CloudDashboard component**

`frontend/src/components/CloudDashboard.tsx`:
```typescript
/*
Cloud Dashboard Component

Displays fleet overview stats and a per-machine compliance table.
Pro/Enterprise only — shows a gate for free tier users.
Web mode only (not rendered in Electron mode).
*/

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { Refresh, Lock, Cloud } from '@mui/icons-material';
import { useLicense } from '../contexts/LicenseContext';
import { getFleetStats, getMachines, FleetStats, MachineRecord } from '../services/api';

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function formatLastSync(lastSyncAt: string | null): { label: string; stale: boolean } {
  if (!lastSyncAt) return { label: 'Never', stale: false };
  const diff = Date.now() - new Date(lastSyncAt).getTime();
  const stale = diff > STALE_MS;
  if (diff < 60_000) return { label: 'Just now', stale };
  if (diff < 3_600_000) return { label: `${Math.floor(diff / 60_000)} min ago`, stale };
  if (diff < 86_400_000) return { label: `${Math.floor(diff / 3_600_000)} hr ago`, stale };
  return { label: `${Math.floor(diff / 86_400_000)} days ago`, stale };
}

function StatusChip({ level }: { level: string | null }) {
  if (!level) return <Typography color="text.secondary">—</Typography>;
  const map: Record<string, { label: string; color: 'success' | 'warning' | 'error' }> = {
    compliant: { label: 'Compliant', color: 'success' },
    at_risk: { label: 'At Risk', color: 'warning' },
    critical: { label: 'Critical', color: 'error' },
  };
  const config = map[level] ?? { label: level, color: 'warning' as const };
  return <Chip label={config.label} color={config.color} size="small" />;
}

interface CloudDashboardProps {
  onNavigate?: (page: string) => void;
}

const CloudDashboard: React.FC<CloudDashboardProps> = ({ onNavigate }) => {
  const { tier } = useLicense();
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [machines, setMachines] = useState<MachineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pro gate
  if (tier !== 'pro' && tier !== 'enterprise') {
    return (
      <Container maxWidth="md" sx={{ mt: 8 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
          <Lock sx={{ fontSize: 64, color: '#2563EB', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Cloud Dashboard — Pro Feature
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3, textAlign: 'center', maxWidth: 480 }}>
            Monitor multiple machines from a single centralized web view. Upgrade to Pro to unlock the cloud dashboard.
          </Typography>
          <Button variant="contained" onClick={() => onNavigate?.('settings')}>
            Enter License Key
          </Button>
        </Box>
      </Container>
    );
  }

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([getFleetStats(), getMachines()]);
      setStats(s);
      setMachines(m);
    } catch (err: any) {
      setError(err.message || 'Failed to load cloud dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !stats) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress size={48} />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Cloud sx={{ color: '#2563EB' }} />
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
            Cloud Dashboard
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<Refresh />} onClick={fetchData} disabled={loading}>
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Fleet Stats Cards */}
      {stats && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 4 }}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h3" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              {stats.total_machines}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Machines
            </Typography>
            {stats.machine_limit !== null && (
              <Typography variant="caption" color="text.secondary">
                {stats.machine_limit} limit
              </Typography>
            )}
          </Paper>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h3" sx={{ fontWeight: 'bold', color: 'success.main' }}>
              {stats.compliant}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Compliant
            </Typography>
            {stats.avg_score !== null && (
              <Typography variant="caption" color="text.secondary">
                Avg: {stats.avg_score}%
              </Typography>
            )}
          </Paper>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h3" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
              {stats.at_risk}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              At Risk
            </Typography>
          </Paper>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h3" sx={{ fontWeight: 'bold', color: 'error.main' }}>
              {stats.critical}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Critical
            </Typography>
          </Paper>
        </Box>
      )}

      {/* Machine List */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Machine</strong></TableCell>
              <TableCell><strong>OS</strong></TableCell>
              <TableCell align="right"><strong>Score</strong></TableCell>
              <TableCell><strong>Last Sync</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {machines.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography color="text.secondary" sx={{ py: 4 }}>
                    No machines have synced yet. Use the Sync to Cloud button in the desktop app.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {machines.map((machine) => {
              const { label: syncLabel, stale } = formatLastSync(machine.last_sync_at);
              return (
                <TableRow key={machine.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace' }}>
                      {machine.hostname}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {machine.os_version ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {machine.last_score !== null ? `${machine.last_score.toFixed(1)}%` : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {syncLabel}
                      </Typography>
                      {stale && (
                        <Chip label="Stale" size="small" color="warning" variant="outlined" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <StatusChip level={machine.compliance_level} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default CloudDashboard;
```

- [ ] **Step 2: Run the 6 frontend tests — confirm they pass**

```bash
cd /tmp/ComplianceGuard/frontend
npm test -- --run src/components/CloudDashboard.test.tsx 2>&1 | tail -20
```
Expected: 6 passed.

- [ ] **Step 3: Wire CloudDashboard into `frontend/src/App.tsx`**

In `App.tsx`, make these three targeted edits:

**Edit 1** — extend the `Page` type:
```typescript
// Before:
type Page = 'dashboard' | 'history' | 'settings';
// After:
type Page = 'dashboard' | 'history' | 'settings' | 'cloud';
```

**Edit 2** — add import at the top of the file (after the EvaluationHistory import):
```typescript
import CloudDashboard from './components/CloudDashboard';
```

Also add the `CloudQueue` icon to the MUI icons import:
```typescript
// Before:
import { Dashboard as DashboardIcon, Settings as SettingsIcon, History, Logout as LogoutIcon } from '@mui/icons-material';
// After:
import { Dashboard as DashboardIcon, Settings as SettingsIcon, History, Logout as LogoutIcon, CloudQueue } from '@mui/icons-material';
```

**Edit 3** — add nav icon (after the History tooltip, before the Settings tooltip, web-mode only):
```typescript
{!isElectron && (
  <Tooltip title="Cloud Dashboard">
    <IconButton
      onClick={() => setCurrentPage('cloud')}
      sx={{
        color: currentPage === 'cloud' ? '#2563EB' : '#6B7280',
        backgroundColor: currentPage === 'cloud' ? '#EFF6FF' : 'transparent',
        mr: 0.5,
      }}
    >
      <CloudQueue />
    </IconButton>
  </Tooltip>
)}
```

**Edit 4** — add route in the main content area (after the history route):
```typescript
{currentPage === 'cloud' && <CloudDashboard onNavigate={(page: string) => setCurrentPage(page as Page)} />}
```

- [ ] **Step 4: Run full frontend test suite — confirm no regressions**

```bash
cd /tmp/ComplianceGuard/frontend
npm test -- --run 2>&1 | tail -15
```
Expected: All tests pass including the new 6.

- [ ] **Step 5: Commit**

```bash
cd /tmp/ComplianceGuard
git add frontend/src/components/CloudDashboard.tsx frontend/src/components/CloudDashboard.test.tsx frontend/src/App.tsx
git commit -m "feat: add CloudDashboard component and web nav route"
```

---

## Phase 3 — Electron Sync

### Task 7: Electron cloud-sync.js

**Files:**
- Create: `electron/cloud-sync.js`

- [ ] **Step 1: Create the cloud sync module**

`electron/cloud-sync.js`:
```javascript
/**
 * Cloud Sync for ComplianceGuard Electron App
 *
 * Handles authentication and compliance snapshot upload to the web server.
 * Config (server URL, tokens) stored in SQLite via the existing database module.
 * HTTP calls use Node.js 18 built-in fetch (Electron 28 ships Node 18).
 */

const KEYS = {
  SERVER_URL: 'cloud_server_url',
  EMAIL: 'cloud_email',
  ACCESS_TOKEN: 'cloud_access_token',
  REFRESH_TOKEN: 'cloud_refresh_token',
};

/**
 * Connect to the web server: login and store tokens.
 * @param {object} database - ComplianceGuardDatabase instance
 * @param {string} serverUrl - e.g. "https://compliance.yourcompany.com"
 * @param {string} email
 * @param {string} password
 * @returns {{ connected: boolean, email: string, serverUrl: string } | { error: string }}
 */
async function cloudConnect(database, serverUrl, email, password) {
  try {
    const url = serverUrl.replace(/\/$/, '');
    const res = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.detail || `Login failed (${res.status})` };
    }

    const data = await res.json();
    await database.setUserSetting(KEYS.SERVER_URL, url, 'string');
    await database.setUserSetting(KEYS.EMAIL, email, 'string');
    await database.setUserSetting(KEYS.ACCESS_TOKEN, data.access_token, 'string');
    await database.setUserSetting(KEYS.REFRESH_TOKEN, data.refresh_token, 'string');

    return { connected: true, email, serverUrl: url };
  } catch (err) {
    return { error: err.message || 'Network error connecting to server' };
  }
}

/**
 * Sync the current machine's compliance snapshot to the web server.
 * Automatically refreshes the access token on 401.
 * @param {object} database
 * @param {{ hostname?: string, overall_score?: number, compliance_level?: string, evidence_count?: number }} syncData
 * @returns {{ machine_id: number, hostname: string, synced_at: string } | { error: string }}
 */
async function cloudSync(database, syncData) {
  const serverUrl = await database.getUserSetting(KEYS.SERVER_URL, null);
  const accessToken = await database.getUserSetting(KEYS.ACCESS_TOKEN, null);
  const refreshToken = await database.getUserSetting(KEYS.REFRESH_TOKEN, null);

  if (!serverUrl || !accessToken) {
    return { error: 'Not connected to cloud. Configure Cloud Sync in Settings.' };
  }

  const os = require('os');
  const payload = {
    hostname: syncData.hostname || os.hostname(),
    os_version: `${os.type()} ${os.release()}`,
    overall_score: syncData.overall_score ?? null,
    compliance_level: syncData.compliance_level ?? null,
    evidence_count: syncData.evidence_count ?? null,
    agent_version: syncData.agent_version || '2.9.0',
  };

  const result = await _postSync(serverUrl, accessToken, payload);

  if (result.status === 401 && refreshToken) {
    const newToken = await _refreshAccessToken(serverUrl, refreshToken);
    if (newToken) {
      await database.setUserSetting(KEYS.ACCESS_TOKEN, newToken, 'string');
      return _postSync(serverUrl, newToken, payload);
    }
    return { error: 'Session expired. Reconnect in Settings > Cloud Sync.' };
  }

  return result;
}

async function _postSync(serverUrl, accessToken, payload) {
  try {
    const res = await fetch(`${serverUrl}/api/v1/machines/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) return { status: 401 };
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.detail || `Sync failed (${res.status})` };
    }

    return res.json();
  } catch (err) {
    return { error: err.message || 'Network error during sync' };
  }
}

async function _refreshAccessToken(serverUrl, refreshToken) {
  try {
    const res = await fetch(`${serverUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Return current cloud config (without tokens).
 */
async function getCloudConfig(database) {
  const serverUrl = await database.getUserSetting(KEYS.SERVER_URL, null);
  const email = await database.getUserSetting(KEYS.EMAIL, null);
  const connected = !!(serverUrl && email);
  return { connected, serverUrl, email };
}

/**
 * Remove all stored cloud config.
 */
async function clearCloudConfig(database) {
  for (const key of Object.values(KEYS)) {
    await database.setUserSetting(key, '', 'string');
  }
  return { disconnected: true };
}

module.exports = { cloudConnect, cloudSync, getCloudConfig, clearCloudConfig };
```

- [ ] **Step 2: Verify syntax**

```bash
node --check /tmp/ComplianceGuard/electron/cloud-sync.js && echo "syntax OK"
```
Expected: `syntax OK`

- [ ] **Step 3: Commit**

```bash
cd /tmp/ComplianceGuard
git add electron/cloud-sync.js
git commit -m "feat: add cloud-sync.js for Electron cloud sync"
```

---

### Task 8: IPC handlers (main.js + preload.js) + Settings Cloud Sync + Dashboard Sync button

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `frontend/src/components/Settings.tsx`
- Modify: `frontend/src/components/Dashboard.tsx`

- [ ] **Step 1: Add CloudSync require + 4 IPC handlers to `electron/main.js`**

After the existing require block (where `LicenseManager` is required), add:
```javascript
const CloudSync = require('./cloud-sync');
```

At the end of the IPC Handlers section (before `app.whenReady()`), add:
```javascript
ipcMain.handle('cloud-connect', async (event, serverUrl, email, password) => {
  return await CloudSync.cloudConnect(database, serverUrl, email, password);
});

ipcMain.handle('cloud-sync', async (event, syncData) => {
  return await CloudSync.cloudSync(database, syncData);
});

ipcMain.handle('cloud-get-config', async () => {
  return await CloudSync.getCloudConfig(database);
});

ipcMain.handle('cloud-disconnect', async () => {
  return await CloudSync.clearCloudConfig(database);
});
```

- [ ] **Step 2: Add 4 cloud methods to `electron/preload.js`**

Inside the `contextBridge.exposeInMainWorld('electronAPI', { ... })` block, add after the `onComplianceUpdate` method:
```javascript
  // Cloud sync
  cloudConnect: (serverUrl, email, password) => {
    if (typeof serverUrl !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return Promise.reject(new Error('Invalid cloud connect params'));
    }
    return ipcRenderer.invoke('cloud-connect', serverUrl, email, password);
  },
  cloudSync: (syncData) => {
    if (!syncData || typeof syncData !== 'object') {
      return Promise.reject(new Error('Invalid sync data'));
    }
    return ipcRenderer.invoke('cloud-sync', syncData);
  },
  cloudGetConfig: () => ipcRenderer.invoke('cloud-get-config'),
  cloudDisconnect: () => ipcRenderer.invoke('cloud-disconnect'),
```

- [ ] **Step 3: Add Cloud Sync section to `frontend/src/components/Settings.tsx`**

Add the `Cloud` icon to the MUI icons import:
```typescript
import { Info, Storage, Backup, Computer, Shield, Palette, CheckCircle, VpnKey, Cloud } from '@mui/icons-material';
```

Add state variables (inside the `Settings` component, after the existing state):
```typescript
const [cloudConfig, setCloudConfig] = useState<{ connected: boolean; serverUrl: string | null; email: string | null } | null>(null);
const [cloudUrl, setCloudUrl] = useState('');
const [cloudEmail, setCloudEmail] = useState('');
const [cloudPassword, setCloudPassword] = useState('');
const [connecting, setConnecting] = useState(false);
```

In the existing `useEffect` that loads Electron data, add:
```typescript
if (isElectron) {
  const api = (window as any).electronAPI;
  // ... existing calls ...
  api.cloudGetConfig().then((cfg: any) => setCloudConfig(cfg));
}
```

Add two handler functions after `handleDarkModeToggle`:
```typescript
const handleCloudConnect = async () => {
  if (!isElectron) return;
  setConnecting(true);
  setError(null);
  try {
    const api = (window as any).electronAPI;
    const result = await api.cloudConnect(cloudUrl, cloudEmail, cloudPassword);
    if (result.error) {
      setError(result.error);
    } else {
      setCloudConfig(result);
      setCloudPassword('');
      setSuccessMessage('Connected to cloud successfully!');
    }
  } catch (err: any) {
    setError(err.message);
  } finally {
    setConnecting(false);
  }
};

const handleCloudDisconnect = async () => {
  if (!isElectron) return;
  const api = (window as any).electronAPI;
  await api.cloudDisconnect();
  setCloudConfig({ connected: false, serverUrl: null, email: null });
  setSuccessMessage('Disconnected from cloud.');
};
```

Add the Cloud Sync section Paper block after the Database section (before the Display section):
```typescript
{isElectron && (
  <Paper sx={{ mb: 3 }}>
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Cloud color="primary" />
        <Typography variant="h6">Cloud Sync</Typography>
        {cloudConfig?.connected && (
          <Chip label="Connected" size="small" color="success" />
        )}
      </Box>
      {cloudConfig?.connected ? (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Connected as <strong>{cloudConfig.email}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {cloudConfig.serverUrl}
          </Typography>
          <Button variant="outlined" color="error" size="small" onClick={handleCloudDisconnect}>
            Disconnect
          </Button>
        </Box>
      ) : (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Connect to your ComplianceGuard web server to sync compliance data to the Cloud Dashboard.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <input
              type="text"
              placeholder="Server URL (e.g. https://compliance.yourcompany.com)"
              value={cloudUrl}
              onChange={(e) => setCloudUrl(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px' }}
            />
            <input
              type="email"
              placeholder="Email"
              value={cloudEmail}
              onChange={(e) => setCloudEmail(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px' }}
            />
            <input
              type="password"
              placeholder="Password"
              value={cloudPassword}
              onChange={(e) => setCloudPassword(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px' }}
            />
            <Button
              variant="contained"
              disabled={connecting || !cloudUrl || !cloudEmail || !cloudPassword}
              onClick={handleCloudConnect}
            >
              {connecting ? 'Connecting...' : 'Connect'}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  </Paper>
)}
```

- [ ] **Step 4: Add Sync to Cloud button to `frontend/src/components/Dashboard.tsx`**

Add `CloudSync as CloudSyncIcon` to the MUI icons import:
```typescript
import { Refresh, CloudUpload, Assessment, Upload, PictureAsPdf, CloudSync as CloudSyncIcon } from '@mui/icons-material';
```

Add state (after existing `const [exportingPDF, setExportingPDF] = useState(false);`):
```typescript
const [syncingCloud, setSyncingCloud] = useState(false);
const [cloudConnected, setCloudConnected] = useState(false);
```

In the `useEffect` that calls `fetchDashboardData()`, also check cloud config:
```typescript
useEffect(() => {
  fetchDashboardData();
  if (isElectron) {
    const api = (window as any).electronAPI;
    api.cloudGetConfig().then((cfg: any) => setCloudConnected(!!cfg?.connected));
  }
}, []);
```

Add the handler after `handleCloseSnackbar`:
```typescript
const handleSyncToCloud = async () => {
  if (!isElectron) return;
  setSyncingCloud(true);
  setState(prev => ({ ...prev, error: null }));
  try {
    const api = (window as any).electronAPI;
    const levelMap: Record<string, string> = {
      compliant: 'compliant',
      partial_compliance: 'at_risk',
      at_risk: 'at_risk',
      non_compliant: 'critical',
    };
    const result = await api.cloudSync({
      overall_score: state.evaluation?.overall_score ?? null,
      compliance_level: state.evaluation?.status
        ? (levelMap[state.evaluation.status] ?? state.evaluation.status)
        : null,
      evidence_count: state.summary?.total_collections ?? null,
    });
    if (result.error) {
      setState(prev => ({ ...prev, error: result.error }));
    } else {
      setState(prev => ({ ...prev, successMessage: 'Synced to cloud successfully!' }));
    }
  } catch (err: any) {
    setState(prev => ({ ...prev, error: err.message || 'Cloud sync failed.' }));
  } finally {
    setSyncingCloud(false);
  }
};
```

Add the button in the button group (after the Refresh button, inside the `{isElectron && (...)}` block before the Upload Evidence button):
```typescript
{isElectron && cloudConnected && (
  <Button
    variant="outlined"
    startIcon={syncingCloud ? <CircularProgress size={16} /> : <CloudSyncIcon />}
    onClick={handleSyncToCloud}
    disabled={syncingCloud}
  >
    {syncingCloud ? 'Syncing...' : 'Sync to Cloud'}
  </Button>
)}
```

- [ ] **Step 5: Run frontend tests — confirm no regressions**

```bash
cd /tmp/ComplianceGuard/frontend
npm test -- --run 2>&1 | tail -15
```
Expected: All tests pass.

- [ ] **Step 6: Run TypeScript check**

```bash
cd /tmp/ComplianceGuard/frontend
npx tsc --noEmit 2>&1 | grep -E "error TS" | head -10 || echo "clean"
```
Expected: `clean`

- [ ] **Step 7: Commit**

```bash
cd /tmp/ComplianceGuard
git add electron/main.js electron/preload.js frontend/src/components/Settings.tsx frontend/src/components/Dashboard.tsx
git commit -m "feat: wire cloud sync IPC handlers and Electron UI (Settings + Dashboard)"
```

---

## Phase 4 — Docs & Release

### Task 9: Version bump + README + CHANGELOG

**Files:**
- Modify: `backend/app/main.py`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Settings.tsx`
- Modify: `package.json`
- Modify: `frontend/package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version strings 2.8.0 → 2.9.0**

In `backend/app/main.py`, replace both `"2.8.0"` strings (in `FastAPI(version=...)` and in the `/health` response) with `"2.9.0"`.

In `frontend/src/App.tsx`, replace `ComplianceGuard v2.8.0` with `ComplianceGuard v2.9.0`.

In `frontend/src/components/Settings.tsx`, replace `useState('2.8.0')` with `useState('2.9.0')`.

In `package.json`, change `"version": "2.8.0"` to `"version": "2.9.0"`.

In `frontend/package.json`, change `"version": "2.8.0"` to `"version": "2.9.0"`.

- [ ] **Step 2: Update README.md**

**Change 1** — version badge (line ~6):
```
src="https://img.shields.io/badge/version-2.8.0-2563EB"
→
src="https://img.shields.io/badge/version-2.9.0-2563EB"
```

**Change 2** — tests badge:
```
tests-294%20passing
→
tests-311%20passing
```

**Change 3** — Limitations section, remove the cloud dashboard limitation:
```
- **Per-machine dashboard only** — the current dashboard shows one machine at a time. A centralized Cloud Dashboard for monitoring multiple machines is coming soon.
```
Replace with:
```
- **Per-machine view in desktop mode** — the Electron app shows one machine. Use the web mode Cloud Dashboard to monitor multiple machines.
```

**Change 4** — Pricing table, promote cloud dashboard from coming soon:
```
| Cloud dashboard (multi-machine) | — | *Coming soon* | *Coming soon* |
```
Replace with:
```
| Cloud dashboard (multi-machine) | — | ✅ | ✅ |
```

**Change 5** — Roadmap table, move cloud sync to Done:
```
| Cloud sync + multi-machine dashboard |
```
Move from "Up Next" to "Done" column.

**Change 6** — FAQ answer for Cloud Dashboard:
```
The Cloud Dashboard (coming soon) will allow you to monitor multiple machines from a single centralized web view — ideal for teams, offices, and managed environments.
```
Replace with:
```
The Cloud Dashboard is available in Pro and Enterprise tiers. Open the web version, navigate to Cloud Dashboard in the top nav, and use Sync to Cloud in each machine's Electron app (Settings > Cloud Sync) to register machines. The dashboard shows all machines' compliance scores, last sync time, and fleet-level stats.
```

- [ ] **Step 3: Add [2.9.0] entry to CHANGELOG.md**

Add at the top (after the `# Changelog` heading, before the `[2.8.0]` entry):

```markdown
## [2.9.0] — 2026-04-17

### Added
- **Cloud Dashboard** — Pro/Enterprise web dashboard showing fleet overview (total machines, compliant, at risk, critical, avg score) and per-machine table with hostname, score, last sync time, and status badge
- **Machine sync API** — `POST /api/v1/machines/sync` endpoint for Electron apps to register and update machine compliance snapshots; enforces per-tier machine limits (Free=1, Pro=10, Enterprise=unlimited)
- **Fleet stats API** — `GET /api/v1/machines/fleet-stats` and `GET /api/v1/machines` endpoints (Pro-gated) for the web dashboard
- **Sync to Cloud button** — Electron Dashboard gains a "Sync to Cloud" button (visible when cloud sync is configured) that POSTs the current score, compliance level, and evidence count to the web server
- **Cloud Sync settings** — New "Cloud Sync" section in Electron Settings for entering server URL + credentials; stores JWT tokens in SQLite via existing user settings infrastructure
- **Stale machine detection** — Machines not synced in 7+ days show a "Stale" warning badge in the dashboard
- **Machine model** — New `machines` table with Alembic migration (`2b7e3f4a9c1d`)
- 17 new tests (11 backend + 6 frontend) — total now 311

### Changed
- Version bumped to 2.9.0 across all files
- README: cloud dashboard promoted from "Coming soon" to ✅ in pricing table; limitations section updated; FAQ updated; roadmap updated
```

- [ ] **Step 4: Run final test checks**

```bash
# Backend
cd /tmp/ComplianceGuard/backend
python -m pytest tests/unit/ tests/integration/ -v 2>&1 | tail -5

# Frontend
cd /tmp/ComplianceGuard/frontend
npm test -- --run 2>&1 | tail -5
```
Expected: All tests pass in both.

- [ ] **Step 5: Commit and tag**

```bash
cd /tmp/ComplianceGuard
git add backend/app/main.py frontend/src/App.tsx frontend/src/components/Settings.tsx package.json frontend/package.json README.md CHANGELOG.md
git commit -m "feat: release v2.9.0 — Cloud Dashboard (multi-machine monitoring)"
git tag v2.9.0
git push origin master
git push origin v2.9.0
```

---

## Spec Coverage Self-Check

| Spec requirement | Task that covers it |
|---|---|
| Machine model `(user_id, hostname)` unique | Task 1 |
| `POST /sync` upsert + tier limits | Task 3 |
| `GET /machines` Pro-gated | Task 3 |
| `GET /fleet-stats` Pro-gated, avg excludes null | Task 3 |
| Fleet stats 4 cards | Task 6 |
| Machine table with stale badge | Task 6 |
| Free tier gate in web dashboard | Task 6 |
| Electron Settings Cloud Sync section | Task 8 |
| Electron Dashboard Sync to Cloud button | Task 8 |
| electron/cloud-sync.js with auto-refresh | Task 7 |
| Version 2.9.0 everywhere | Task 9 |
| README/CHANGELOG updated | Task 9 |
| 17 new tests (311 total) | Tasks 2, 5 |
