"""
CG-M1 integration regression: POST /api/v1/evidence/collect persists items
with status DERIVED from the collector payload.

Before the fix, every item was stored with status="compliant", so a bucket or
policy the evidence marked non_compliant was displayed as green COMPLIANT.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    """Register a fully verified user (verification is orthogonal to CG-M1)."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "evidence-status@test.com",
            "password": "Secure@1pass",
            "first_name": "Ev", "last_name": "Status",
        },
    )
    assert res.status_code == 200
    from app.models.user import User
    db = TestSession()
    user = db.query(User).filter(User.email == "evidence-status@test.com").first()
    token = user.verification_token
    db.close()
    assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _bundle_with(items, failed=None):
    return {
        "collection_id": "evidence_20260101_000000",
        "collection_timestamp": "2026-01-01T00:00:00Z",
        "collection_status": "success" if not failed else "partial_failure",
        "evidence_count": len(items),
        "evidence_items": items,
        "failed_collections": failed or [],
        "summary": {},
    }


class FakeCollector:
    def __init__(self, bundle):
        self._bundle = bundle

    def collect_all_evidence(self, *args, **kwargs):
        return self._bundle


def test_collect_persists_derived_statuses_not_hardcoded_compliant(client, auth_headers, monkeypatch):
    import app.api.evidence as evidence_mod

    mixed = _bundle_with([
        {
            "evidence_type": "s3_encryption",
            "source": "aws",
            "total_buckets": 2,
            "encrypted_buckets": 1,
            "bucket_encryption_status": [
                {"bucket_name": "safe", "compliance_status": "compliant"},
                {"bucket_name": "open", "compliance_status": "non_compliant"},
            ],
            "encryption_compliance_rate": 50.0,
        },
        {
            "evidence_type": "iam_policy",
            "source": "aws",
            "total_policies": 1,
            "over_privileged_policies": 1,
            "policy_analysis": [
                {"policy_name": "Admin", "compliance_status": "non_compliant"},
            ],
            "compliance_rate": 0.0,
        },
    ])
    monkeypatch.setattr(evidence_mod, "EvidenceCollectionService", lambda: FakeCollector(mixed))

    res = client.post("/api/v1/evidence/collect", json={}, headers=auth_headers)
    assert res.status_code == 200, res.text
    statuses = [(i["evidence_type"], i["status"]) for i in res.json()["items"]]
    assert ("s3_encryption", "non_compliant") in statuses
    assert ("iam_policy", "non_compliant") in statuses
    assert all(s != "compliant" for _, s in statuses), f"no fabricated COMPLIANT: {statuses}"


def test_collect_fully_compliant_payload_is_compliant(client, auth_headers, monkeypatch):
    import app.api.evidence as evidence_mod

    clean = _bundle_with([
        {
            "evidence_type": "s3_encryption",
            "source": "aws",
            "total_buckets": 1,
            "encrypted_buckets": 1,
            "bucket_encryption_status": [
                {"bucket_name": "safe", "compliance_status": "compliant"},
            ],
            "encryption_compliance_rate": 100.0,
        }
    ])
    monkeypatch.setattr(evidence_mod, "EvidenceCollectionService", lambda: FakeCollector(clean))

    res = client.post("/api/v1/evidence/collect", json={}, headers=auth_headers)
    assert res.status_code == 200, res.text
    assert res.json()["items"][0]["status"] == "compliant"


def test_collect_without_credentials_reports_not_configured_not_success(client, auth_headers):
    """CG-M3: no stored AWS credentials -> 'not_configured', never a fake
    'success' with 0 items that the UI would announce as complete."""
    import app.api.evidence as evidence_mod

    # No FakeCollector: the real service runs with no stored AwsCredential for
    # this user (the fixture registers a fresh user with no credentials).
    res = client.post("/api/v1/evidence/collect", json={}, headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "not_configured"
    assert body["evidence_count"] == 0
    assert body["failed_count"] == 0
    assert body["items"] == []


def test_collect_service_no_credentials_returns_not_configured():
    """Service-level CG-M3 regression: no creds -> not_configured bundle."""
    from app.services.evidence_collector import EvidenceCollectionService
    bundle = EvidenceCollectionService().collect_all_evidence()
    assert bundle["collection_status"] == "not_configured"
    assert bundle["evidence_count"] == 0
    assert bundle["failed_collections"] == []
