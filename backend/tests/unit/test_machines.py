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
