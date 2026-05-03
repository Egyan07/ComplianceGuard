"""Tests for POST /compliance/evaluate-from-evidence."""
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
            email="eval@example.com",
            hashed_password=get_password_hash("Eval@1pass"),
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        col = EvidenceCollection(
            collection_id="col-eval-1",
            user_id=user.id,
            status="completed",
            evidence_count=3,
            failed_count=0,
        )
        db.add(col)
        db.flush()
        for etype in ["event_logs", "firewall", "iam_policy"]:
            db.add(EvidenceItem(
                collection_id=col.id,
                evidence_type=etype,
                source="aws" if etype == "iam_policy" else "system",
                status="compliant",
                data={},
            ))
        db.commit()
    finally:
        db.close()

    resp = client.post("/api/v1/auth/login", data={
        "username": "eval@example.com",
        "password": "Eval@1pass",
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
            email="noevidence@example.com",
            hashed_password=get_password_hash("NoEvid@1pass"),
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()

    resp = client.post("/api/v1/auth/login", data={
        "username": "noevidence@example.com",
        "password": "NoEvid@1pass",
    })
    token = resp.json()["access_token"]
    yield client, token
    app.dependency_overrides.clear()


def test_evaluate_from_evidence_returns_evaluation(auth_client_with_evidence):
    client, token = auth_client_with_evidence
    resp = client.post(
        "/api/v1/compliance/evaluate-from-evidence",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "overall_score" in data
    assert "compliance_status" in data
    assert data["overall_score"] >= 0.0


def test_evaluate_from_evidence_no_evidence_returns_zero(auth_client_no_evidence):
    client, token = auth_client_no_evidence
    resp = client.post(
        "/api/v1/compliance/evaluate-from-evidence",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["overall_score"] == 0.0


def test_evaluate_from_evidence_unauthorized():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    resp = client.post("/api/v1/compliance/evaluate-from-evidence")
    assert resp.status_code == 401
    app.dependency_overrides.clear()
