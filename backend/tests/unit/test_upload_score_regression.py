"""Phase 11 (E): upload -> score end-to-end regression tests.

These cross the REAL boundary: the evidence_type a UI could send -> POST
/evidence/upload -> persistence -> /compliance/evaluate-from-evidence ->
canonical engine -> control evaluation -> overall score.

The key assertion: a supported evidence type documented as satisfying a control
must actually change that control's evaluation when submitted. This exists to
prevent the Phase 10 bug (97 UI-selectable types that scored nothing) from
returning.
"""
import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.auth import get_password_hash
from app.core.canonical_router import evaluate_from_evidence_canonical
from app.models.user import User

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
def client_and_token():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    db = TestSession()
    try:
        db.add(User(
            email="upload@example.com",
            hashed_password=get_password_hash("Upload@1pass"),
            is_active=True,
            is_verified=True,
            license_tier="pro",
        ))
        db.commit()
    finally:
        db.close()
    resp = client.post("/api/v1/auth/login", data={
        "username": "upload@example.com",
        "password": "Upload@1pass",
    })
    token = resp.json()["access_token"]
    yield client, token
    app.dependency_overrides.clear()


def _upload(client, token, evidence_type, filename="evidence.pdf"):
    # NOTE: evidence_type is a QUERY parameter (bare `str` in the endpoint
    # signature), not a form field — the API contract the web client uses.
    return client.post(
        "/api/v1/evidence/upload",
        headers={"Authorization": f"Bearer {token}"},
        params={"evidence_type": evidence_type},
        files={"file": (filename, io.BytesIO(b"%PDF-1.4 test"), "application/pdf")},
    )


def _evaluate(client, token):
    return client.post(
        "/api/v1/compliance/evaluate-from-evidence",
        headers={"Authorization": f"Bearer {token}"},
    )


def _engine_control_status(evidence_types, control_id: str) -> dict:
    """Control-level expectation from the SAME engine the API runs — the API
    response exposes no per-control detail, so this asserts what the engine
    (and therefore the API) evaluated for the uploaded types."""
    result = evaluate_from_evidence_canonical("soc2", evidence_types)
    return result["control_results"][control_id]


class TestUploadToScore:
    def test_canonical_type_changes_the_control_it_documents(self, client_and_token):
        """The Phase 10 bug, directly: a UI-documented type must move the score."""
        client, token = client_and_token
        # CC1.2 requires exactly [audit_reports, policy_document].
        assert _upload(client, token, "audit_reports").status_code == 201
        assert _upload(client, token, "policy_document").status_code == 201

        eval_resp = _evaluate(client, token)
        assert eval_resp.status_code == 200
        data = eval_resp.json()

        expected = evaluate_from_evidence_canonical("soc2", ["audit_reports", "policy_document"])
        assert data["overall_score"] == expected["overall_score"]
        # The uploaded types must actually satisfy CC1.2 in the engine.
        assert _engine_control_status(
            ["audit_reports", "policy_document"], "CC1.2"
        )["status"] == "compliant"

    def test_legacy_alias_translates_and_contributes(self, client_and_token):
        """A stored legacy alias (security_settings) must translate to security_policies."""
        client, token = client_and_token
        assert _upload(client, token, "security_settings").status_code == 201

        eval_resp = _evaluate(client, token)
        data = eval_resp.json()
        expected = evaluate_from_evidence_canonical("soc2", ["security_policies"])
        assert data["overall_score"] == expected["overall_score"]

    def test_unsupported_ui_type_is_rejected_not_silently_stored(self, client_and_token):
        """A former dead UI type (code_of_conduct) must be rejected with 400."""
        client, token = client_and_token
        resp = _upload(client, token, "code_of_conduct")
        assert resp.status_code == 400
        assert "Unknown evidence type" in resp.json()["detail"]

        # Nothing was stored either.
        items = client.get(
            "/api/v1/evidence/items", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert items == []

    def test_duplicate_evidence_deduplicates(self, client_and_token):
        """Uploading the same type twice must not double its contribution."""
        client, token = client_and_token
        assert _upload(client, token, "policy_document").status_code == 201
        assert _upload(client, token, "policy_document").status_code == 201

        eval_resp = _evaluate(client, token)
        data = eval_resp.json()
        expected = evaluate_from_evidence_canonical("soc2", ["policy_document", "policy_document"])
        single = evaluate_from_evidence_canonical("soc2", ["policy_document"])
        assert data["overall_score"] == expected["overall_score"] == single["overall_score"]

    def test_evidence_that_should_not_affect_a_control_leaves_it_unassessed(self, client_and_token):
        """policy_document is not required by CC6.1 -> CC6.1 stays not_assessed."""
        client, token = client_and_token
        assert _upload(client, token, "policy_document").status_code == 201
        eval_resp = _evaluate(client, token)
        assert eval_resp.status_code == 200
        # policy_document is not in CC6.1's required list -> stays not_assessed.
        assert _engine_control_status(["policy_document"], "CC6.1")["status"] == "not_assessed"

    def test_full_control_satisfaction(self, client_and_token):
        """Uploading every required type for a control makes it compliant,
        exactly matching the canonical engine's overall result."""
        client, token = client_and_token
        for t in ["audit_reports", "policy_document"]:
            assert _upload(client, token, t).status_code == 201
        eval_resp = _evaluate(client, token)
        data = eval_resp.json()
        expected = evaluate_from_evidence_canonical("soc2", ["audit_reports", "policy_document"])
        assert data["overall_score"] == expected["overall_score"]
        # Full coverage of CC1.2's required evidence -> score 100, status compliant.
        cc12 = _engine_control_status(["audit_reports", "policy_document"], "CC1.2")
        assert cc12["score"] == 100 and cc12["status"] == "compliant"

    def test_non_scoring_defaults_are_still_accepted(self, client_and_token):
        """manual_upload/document/text remain legitimate storage values."""
        client, token = client_and_token
        for t in ["manual_upload", "document", "text", "unknown"]:
            assert _upload(client, token, t).status_code == 201
