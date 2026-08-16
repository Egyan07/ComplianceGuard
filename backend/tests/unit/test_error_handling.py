"""
Regression tests for Phase 1 error-handling hardening:

- Endpoints must never leak internal exception text to clients.
- Application errors return safe, generic detail messages.
- Every response carries an X-Request-ID correlation header.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.auth import create_access_token, get_password_hash
from app.core.database import Base, get_db
from app.models.user import User


_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _override_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=_engine)
    app.dependency_overrides[get_db] = _override_db
    yield
    Base.metadata.drop_all(bind=_engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_header():
    """Verified pro user with a valid access token."""
    db = _Session()
    user = User(
        email="err@test.com",
        hashed_password=get_password_hash("Secure@1pass"),
        is_active=True,
        is_verified=True,
        license_tier="pro",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    token = create_access_token({"sub": "err@test.com"}, expires_delta=timedelta(minutes=30))
    return {"Authorization": f"Bearer {token}"}


# ── internal exception text must not leak ────────────────────────────────────

def test_evaluate_failure_returns_generic_detail(client, auth_header, monkeypatch):
    """A failing evaluation must return a safe message, never the internal error."""
    import app.api.compliance as compliance_mod

    def _exploding(*args, **kwargs):
        raise ValueError("secret-internal-detail:/etc/passwd/leak")

    monkeypatch.setattr(compliance_mod, "evaluate_from_evidence_canonical", _exploding)

    resp = client.post(
        "/api/v1/compliance/evaluate",
        json={
            "evidence_data": {"CC1.1": {"evidence_provided": [], "status": "unknown", "score": 0.0}},
            "evaluated_by": "test",
        },
        headers=auth_header,
    )

    assert resp.status_code == 500
    body = resp.text.lower()
    assert "secret-internal-detail" not in body
    assert "/etc/passwd" not in body
    assert resp.json()["detail"] == "Evaluation failed. Please try again later."


def test_evidence_collect_failure_returns_generic_detail(client, auth_header):
    """A failing evidence collection must return a safe message, never the internal error."""
    import app.api.evidence as evidence_mod

    class ExplodingCollector:
        def collect_all_evidence(self, *args, **kwargs):
            raise RuntimeError("iam-credentials-rotated-at-3am")

    # No stored AWS creds for this user, so collect_all_evidence is called directly.
    evidence_mod.EvidenceCollectionService = ExplodingCollector  # type: ignore

    resp = client.post("/api/v1/evidence/collect", json={}, headers=auth_header)

    assert resp.status_code == 500
    body = resp.text.lower()
    assert "iam-credentials" not in body
    assert resp.json()["detail"] == "Evidence collection failed. Please try again later."


# ── X-Request-ID correlation header ──────────────────────────────────────────

def test_responses_carry_request_id(client):
    """Every response includes an X-Request-ID, echoing a client-supplied one."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.headers.get("X-Request-ID")
    assert len(resp.headers["X-Request-ID"]) >= 8

    resp2 = client.get("/health", headers={"X-Request-ID": "client-supplied-id-123"})
    assert resp2.headers.get("X-Request-ID") == "client-supplied-id-123"


def test_error_response_includes_request_id(client, auth_header, monkeypatch):
    """The X-Request-ID is present on error responses too, for support correlation."""
    import app.api.compliance as compliance_mod

    def _exploding(*args, **kwargs):
        raise ValueError("boom")

    monkeypatch.setattr(compliance_mod, "evaluate_from_evidence_canonical", _exploding)

    resp = client.post(
        "/api/v1/compliance/evaluate",
        json={"evidence_data": {"CC1.1": {"evidence_provided": [], "status": "unknown", "score": 0.0}}},
        headers={**auth_header, "X-Request-ID": "corr-abc-123"},
    )
    assert resp.status_code == 500
    assert resp.headers.get("X-Request-ID") == "corr-abc-123"
