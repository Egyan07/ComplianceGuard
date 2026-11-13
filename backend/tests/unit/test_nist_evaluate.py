"""Tests for POST /nist/evaluate-from-evidence."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.nist import _load_controls
from app.core.auth import get_password_hash
from app.core.database import Base, get_db
from app.main import app
from app.models.evidence import EvidenceCollection, EvidenceItem
from app.models.user import User

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def db_setup():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def override_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()


def nist_evidence_types(limit=3):
    """Canonical evidence types the NIST table itself requires."""
    found = []
    for control in _load_controls():
        for etype in control.get("required_evidence") or []:
            if etype not in found:
                found.append(etype)
        if len(found) >= limit:
            break
    return found[:limit]


def make_client(email, password, with_evidence):
    app.dependency_overrides[get_db] = override_db
    db = Session()
    try:
        user = User(
            email=email,
            hashed_password=get_password_hash(password),
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        if with_evidence:
            types = nist_evidence_types()
            collection = EvidenceCollection(
                collection_id=f"col-{email.split('@')[0]}",
                user_id=user.id,
                status="completed",
                evidence_count=len(types),
                failed_count=0,
            )
            db.add(collection)
            db.flush()
            for etype in types:
                db.add(EvidenceItem(
                    collection_id=collection.id,
                    evidence_type=etype,
                    source="system",
                    status="compliant",
                    data={},
                ))
            db.commit()
    finally:
        db.close()
    client = TestClient(app)
    login = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    return client, login.json()["access_token"]


@pytest.fixture
def with_evidence():
    yield make_client("nist@example.com", "Nist@1pass1", True)
    app.dependency_overrides.clear()


@pytest.fixture
def without_evidence():
    yield make_client("nist_noev@example.com", "NistNo@1pass", False)
    app.dependency_overrides.clear()


def test_evaluate_returns_200_with_score(with_evidence):
    client, token = with_evidence
    resp = client.post(
        "/api/v1/nist/evaluate-from-evidence",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert 0.0 < data["overall_score"] <= 100.0
    assert data["framework_id"] == "nist_csf_2_0"
    assert data["control_count"] == 74
    assert data["compliance_status"] in {"compliant", "partial", "non_compliant", "not_assessed"}
    assert data["not_assessed_controls"] < 74


def test_evaluate_no_evidence_returns_zero(without_evidence):
    client, token = without_evidence
    resp = client.post(
        "/api/v1/nist/evaluate-from-evidence",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["overall_score"] == 0.0
    assert data["compliance_status"] == "not_assessed"
    assert data["not_assessed_controls"] == 74


def test_evaluate_unauthorized():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    assert client.post("/api/v1/nist/evaluate-from-evidence").status_code == 401
    app.dependency_overrides.clear()
