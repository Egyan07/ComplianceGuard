"""Tests for GET /evidence/items/{id}/controls endpoint."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.auth import get_password_hash
from app.models.user import User
from app.models.evidence import EvidenceCollection, EvidenceItem

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


def override_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def auth_client():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)

    db = TestSession()
    try:
        user = User(
            email="controls@example.com",
            hashed_password=get_password_hash("Controls@1pass"),
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        col = EvidenceCollection(
            collection_id="col-ctrl-1",
            user_id=user.id,
            status="completed",
            evidence_count=2,
            failed_count=0,
        )
        db.add(col)
        db.flush()
        firewall_item = EvidenceItem(
            collection_id=col.id,
            evidence_type="firewall",
            source="system",
            status="compliant",
            data={},
        )
        manual_item = EvidenceItem(
            collection_id=col.id,
            evidence_type="manual_upload",
            source="manual",
            status="pending_review",
            data={},
        )
        db.add(firewall_item)
        db.add(manual_item)
        db.commit()
        db.refresh(firewall_item)
        db.refresh(manual_item)
        firewall_id = firewall_item.id
        manual_id = manual_item.id
    finally:
        db.close()

    resp = client.post("/api/v1/auth/login", data={
        "username": "controls@example.com",
        "password": "Controls@1pass",
    })
    token = resp.json()["access_token"]
    yield client, token, firewall_id, manual_id
    app.dependency_overrides.clear()


def test_controls_for_known_type(auth_client):
    client, token, firewall_id, _ = auth_client
    resp = client.get(
        f"/api/v1/evidence/items/{firewall_id}/controls",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["evidence_type"] == "firewall"
    assert "CC6.5" in data["controls"]
    assert data["controls"]["CC6.5"] == 0.9


def test_controls_for_unmapped_type(auth_client):
    client, token, _, manual_id = auth_client
    resp = client.get(
        f"/api/v1/evidence/items/{manual_id}/controls",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["evidence_type"] == "manual_upload"
    assert data["controls"] == {}


def test_controls_not_found(auth_client):
    client, token, _, _ = auth_client
    resp = client.get(
        "/api/v1/evidence/items/99999/controls",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


def test_controls_unauthorized():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    resp = client.get("/api/v1/evidence/items/1/controls")
    assert resp.status_code == 401
    app.dependency_overrides.clear()
