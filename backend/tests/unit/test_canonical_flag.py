"""
Integration test for the canonical evaluate-from-evidence contract.

Boots the real FastAPI app (canonical engine is the single scoring path since
Phase 5 removed the EVALUATION_ENGINE flag) and asserts the endpoints return
the canonical response shape: 0-100 overall score, canonical status vocabulary,
and full control counts.
"""
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
def canonical_client():
    """Authenticated client with stored evidence for the canonical engine."""
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)

    db = TestSession()
    try:
        user = User(
            email="canon@example.com",
            hashed_password=get_password_hash("Canon@1pass"),
            is_active=True,
            is_verified=True,
            license_tier="pro",  # evaluation history requires Pro
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        col = EvidenceCollection(
            collection_id="col-canon-1",
            user_id=user.id,
            status="completed",
            evidence_count=3,
            failed_count=0,
        )
        db.add(col)
        db.flush()
        # Legacy vocabulary: users -> user_provisioning, event_logs (identity),
        # s3_encryption -> encryption_policies.
        for etype in ["users", "event_logs", "s3_encryption"]:
            db.add(EvidenceItem(
                collection_id=col.id,
                evidence_type=etype,
                source="aws",
                status="compliant",
                data={},
            ))
        db.commit()
    finally:
        db.close()

    resp = client.post("/api/v1/auth/login", data={
        "username": "canon@example.com",
        "password": "Canon@1pass",
    })
    token = resp.json()["access_token"]
    yield client, token
    app.dependency_overrides.clear()


def test_soc2_evaluate_uses_canonical_engine(canonical_client):
    client, token = canonical_client
    resp = client.post(
        "/api/v1/compliance/evaluate-from-evidence",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Canonical response contract: 0-100 score, canonical status vocabulary.
    assert "overall_score" in data
    assert "compliance_status" in data
    assert "compliance_level" in data
    assert 0.0 <= data["overall_score"] <= 100.0
    assert data["compliance_status"] in {"compliant", "partial", "non_compliant", "not_assessed"}
    # Canonical engine computed the result over all 54 controls.
    assert data["control_count"] == 54
    # Evidence was translated: users->user_provisioning, s3_encryption->encryption_policies.
    assert data["evidence_summary"]["canonical_types_present"]
    # Phase 6: the real control-status counts are in the response (the web UI
    # previously fabricated these as zeros).
    assert data["partial_controls"] + data["non_compliant_controls"] + data["not_assessed_controls"] + data["compliant_controls"] == 54
    assert data["not_assessed_controls"] > 0  # sparse evidence -> honest counts

    # History re-reads the persisted record and surfaces the same counts.
    history_resp = client.get(
        "/api/v1/compliance/evaluations/history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert len(history) >= 1
    latest = history[0]
    assert latest["not_assessed_controls"] == data["not_assessed_controls"]
    assert latest["partial_controls"] == data["partial_controls"]


def test_gdpr_evaluate_uses_canonical_engine(canonical_client):
    client, token = canonical_client
    resp = client.post(
        "/api/v1/gdpr/evaluate-from-evidence",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["framework_id"] == "gdpr_2016_679"
    assert data["control_count"] == 38
    assert 0.0 <= data["overall_score"] <= 100.0
    assert data["compliance_status"] in {"compliant", "partial", "non_compliant", "not_assessed"}
