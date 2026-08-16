"""Tests for POST /iso27001/evaluate-from-evidence."""
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
def auth_client_with_evidence():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    db = TestSession()
    try:
        user = User(
            email="iso@example.com",
            hashed_password=get_password_hash("Iso@1pass1"),
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        col = EvidenceCollection(
            collection_id="col-iso-1",
            user_id=user.id,
            status="completed",
            evidence_count=2,
            failed_count=0,
        )
        db.add(col)
        db.flush()
        for etype in ["event_logs", "firewall"]:
            db.add(EvidenceItem(
                collection_id=col.id,
                evidence_type=etype,
                source="system",
                status="compliant",
                data={},
            ))
        db.commit()
    finally:
        db.close()
    resp = client.post("/api/v1/auth/login", data={
        "username": "iso@example.com",
        "password": "Iso@1pass1",
    })
    token = resp.json()["access_token"]
    yield client, token
    app.dependency_overrides.clear()


@pytest.fixture
def auth_client_no_evidence():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    db = TestSession()
    try:
        user = User(
            email="iso_noev@example.com",
            hashed_password=get_password_hash("IsoNo@1pass"),
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()
    resp = client.post("/api/v1/auth/login", data={
        "username": "iso_noev@example.com",
        "password": "IsoNo@1pass",
    })
    token = resp.json()["access_token"]
    yield client, token
    app.dependency_overrides.clear()


def test_evaluate_returns_200_with_score(auth_client_with_evidence):
    client, token = auth_client_with_evidence
    resp = client.post(
        "/api/v1/iso27001/evaluate-from-evidence",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Canonical contract: 0-100 scale + canonical status vocabulary.
    assert 0.0 < data["overall_score"] <= 100.0
    assert data["framework_id"] == "iso27001_v2013"
    assert data["control_count"] == 47
    assert data["compliance_status"] in {"compliant", "partial", "non_compliant", "not_assessed"}
    assert data["not_assessed_controls"] < 47  # evidence was translated and scored


def test_evaluate_no_evidence_returns_zero(auth_client_no_evidence):
    client, token = auth_client_no_evidence
    resp = client.post(
        "/api/v1/iso27001/evaluate-from-evidence",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["overall_score"] == 0.0
    assert data["compliance_status"] == "non_compliant"
    assert data["not_assessed_controls"] == 47


def test_evaluate_unauthorized():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    resp = client.post("/api/v1/iso27001/evaluate-from-evidence")
    assert resp.status_code == 401
    app.dependency_overrides.clear()
