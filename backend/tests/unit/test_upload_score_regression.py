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
    # Query-param contract (scripts/curl): ?evidence_type=... alongside the
    # multipart file. The form-field contract has its own tests below.
    return client.post(
        "/api/v1/evidence/upload",
        headers={"Authorization": f"Bearer {token}"},
        params={"evidence_type": evidence_type},
        files={"file": (filename, io.BytesIO(b"%PDF-1.4 test"), "application/pdf")},
    )


def _upload_form(client, token, evidence_type, **fields):
    """The WEB dialog's contract: multipart FORM fields via FormData.
    Regression: bare-`str` endpoint params bound as QUERY parameters, so every
    form field was silently ignored and all web uploads were stored as the
    non-scoring 'manual_upload' type — they could never move a score."""
    data = {"evidence_type": evidence_type, **fields}
    return client.post(
        "/api/v1/evidence/upload",
        headers={"Authorization": f"Bearer {token}"},
        data=data,
        files={"file": ("evidence.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")},
    )


def _evaluate(client, token):
    return client.post(
        "/api/v1/compliance/evaluate-from-evidence",
        headers={"Authorization": f"Bearer {token}"},
    )


def _engine_control_status(evidence_types, control_id: str) -> dict:
    """Control-level expectation from the SAME engine the API runs — used to
    cross-check the API's per-control `control_results` payload."""
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
        """policy_document is not required by CC7.1 -> CC7.1 stays not_assessed.

        (Real CC6.1 legitimately requires a policy document as partial
        evidence for logical access security, so CC7.1 — configuration and
        vulnerability detection — is the correct exemplar for 'unrelated
        evidence must not assess a control'.)"""
        client, token = client_and_token
        assert _upload(client, token, "policy_document").status_code == 201
        eval_resp = _evaluate(client, token)
        assert eval_resp.status_code == 200
        # policy_document is not in CC7.1's required list -> stays not_assessed.
        assert _engine_control_status(["policy_document"], "CC7.1")["status"] == "not_assessed"

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


class TestWebFormContract:
    """The browser dialog posts multipart FORM fields (FormData) — the endpoint
    must bind them. The pre-fix bug bound every form field as a query param,
    silently storing all web uploads as non-scoring 'manual_upload'."""

    def test_form_field_evidence_type_is_bound_and_scores(self, client_and_token):
        client, token = client_and_token
        resp = _upload_form(client, token, "audit_reports", title="Board policy")
        assert resp.status_code == 201
        # The RESPONSE echoes the requested type — pre-fix it echoed the
        # 'manual_upload' default because the form field never bound.
        assert resp.json()["evidence_type"] == "audit_reports"

        data = _evaluate(client, token).json()
        expected = evaluate_from_evidence_canonical("soc2", ["audit_reports"])
        assert data["overall_score"] == expected["overall_score"]
        assert data["overall_score"] > 0, "web form upload must move the score"

    def test_form_metadata_is_stored_on_the_item(self, client_and_token):
        client, token = client_and_token
        resp = _upload_form(
            client, token, "system_configs",
            title="Password policy",
            description="Org baseline",
            control_id="CC6.1",
            framework_id="1",
        )
        assert resp.status_code == 201
        from app.models.evidence import EvidenceItem as EvItem
        db = TestSession()
        try:
            item = db.query(EvItem).order_by(EvItem.id.desc()).first()
            assert item.data["title"] == "Password policy"
            assert item.data["control_id"] == "CC6.1"
            assert item.data["framework_id"] == "1"
        finally:
            db.close()

    def test_query_params_still_work_alongside_form(self, client_and_token):
        """Back-compat: the pre-web query-param contract keeps working."""
        client, token = client_and_token
        resp = client.post(
            "/api/v1/evidence/upload",
            headers={"Authorization": f"Bearer {token}"},
            params={"evidence_type": "policy_document"},
            files={"file": ("e.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        )
        assert resp.status_code == 201
        assert resp.json()["evidence_type"] == "policy_document"

    def test_evaluate_response_exposes_control_results(self, client_and_token):
        """Web ControlHeatmap data: per-control results ride the response
        (and history) — additive Phase-4 style metadata, null on legacy rows.
        CC6.8 is automatable with [system_configs, event_logs], so uploading
        both types must make it fully compliant."""
        client, token = client_and_token
        assert _upload_form(client, token, "system_configs").status_code == 201
        assert _upload_form(client, token, "event_logs").status_code == 201
        data = _evaluate(client, token).json()
        cr = data.get("control_results") or {}
        assert len(cr) == data["control_count"] == 43
        cc68 = cr["CC6.8"]
        assert cc68["status"] == "compliant"
        assert cc68["score"] == 100
        assert "assessment_mode" in cc68 and "manual_required" in cc68
        # History serves the same detail (same serializer).
        hist = client.get(
            "/api/v1/compliance/evaluations/history",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert hist.status_code == 200
        rows = hist.json()
        assert rows and (rows[0].get("control_results") or {})["CC6.8"]["status"] == "compliant"
