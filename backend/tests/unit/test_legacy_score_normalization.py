"""Phase 11 (D): legacy 0-1 score normalization regression tests.

Pre-Phase-5 evaluation records persisted overall_score on a 0-1 scale with the
legacy status vocabulary (partially_compliant / not_applicable / not_evaluated).
The read path must normalize those to the canonical 0-100 contract WITHOUT
touching canonical records — no double multiplication.
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
from app.models.evaluation import ComplianceEvaluationRecord, ControlAssessmentRecord

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
        user = User(
            email="legacy@example.com",
            hashed_password=get_password_hash("Legacy@1pass"),
            is_active=True,
            is_verified=True,
            license_tier="pro",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    finally:
        db.close()

    resp = client.post("/api/v1/auth/login", data={
        "username": "legacy@example.com",
        "password": "Legacy@1pass",
    })
    token = resp.json()["access_token"]
    yield client, token, user.id
    app.dependency_overrides.clear()


def _add_record(user_id, *, overall_score, compliance_status, assessments, evaluation_id=None):
    """Insert an evaluation record + per-control assessments directly (bypasses the engine)."""
    db = TestSession()
    try:
        record = ComplianceEvaluationRecord(
            evaluation_id=evaluation_id or f"eval-{overall_score}-{compliance_status}",
            framework_id="soc2_v2017",
            user_id=user_id,
            overall_score=overall_score,
            compliance_status=compliance_status,
            compliance_level="partial",
            control_count=len(assessments),
            compliant_controls=0,
        )
        db.add(record)
        db.flush()
        for control_id, status, score in assessments:
            db.add(ControlAssessmentRecord(
                evaluation_id=record.id,
                control_id=control_id,
                status=status,
                score=score,
            ))
        db.commit()
        return record.evaluation_id
    finally:
        db.close()


LEGACY_OVERALL = [
    (0.62, "partially_compliant", [("CC1.1", "partially_compliant", 0.5), ("CC1.2", "not_evaluated", 0.0)]),
    (0.78, "partially_compliant", [("CC1.1", "compliant", 0.95), ("CC1.2", "not_evaluated", 0.0)]),
    # Legacy overall status can look canonical; the not_evaluated assessment still marks it legacy.
    (0.85, "compliant", [("CC1.1", "compliant", 0.95), ("CC1.2", "not_evaluated", 0.0)]),
    (1.0, "compliant", [("CC1.1", "compliant", 1.0), ("CC1.2", "not_evaluated", 0.0)]),
    (0.0, "not_evaluated", [("CC1.1", "not_evaluated", 0.0)]),
]

CANONICAL_OVERALL = [
    (62, "partial", [("CC1.1", "partial", 50), ("CC1.2", "not_assessed", 0)]),
    (78, "partial", [("CC1.1", "partial", 78)]),
    (100, "compliant", [("CC1.1", "compliant", 100)]),
    (0, "not_assessed", [("CC1.1", "not_assessed", 0)]),
    (1, "non_compliant", [("CC1.1", "non_compliant", 1)]),  # canonical 1.0 must NOT become 100
]


class TestHistoryNormalization:
    def test_legacy_records_are_scaled_to_0_100(self, client_and_token):
        client, token, user_id = client_and_token
        for score, status, assessments in LEGACY_OVERALL:
            # Assessments matter: the 0.85 record has a canonical-looking overall
            # status and is only detectable as legacy via its not_evaluated rows.
            _add_record(user_id, overall_score=score, compliance_status=status, assessments=assessments)

        resp = client.get("/api/v1/compliance/evaluations/history",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        # The response contract has no evaluation_id; key by the normalized view.
        rows = {(r["overall_score"], r["compliance_status"]): r for r in resp.json()}

        assert rows[(62.0, "partial")]["overall_score"] == pytest.approx(62.0)
        assert rows[(62.0, "partial")]["compliance_status"] == "partial"
        assert rows[(78.0, "partial")]["overall_score"] == pytest.approx(78.0)
        # Legacy overall status can look canonical; the not_evaluated assessment marks it legacy.
        assert rows[(85.0, "compliant")]["overall_score"] == pytest.approx(85.0)
        # Exactly 1.0 on a legacy record -> 100, not left as "1%" or doubled twice.
        assert rows[(100.0, "compliant")]["overall_score"] == pytest.approx(100.0)
        assert rows[(0.0, "not_assessed")]["overall_score"] == pytest.approx(0.0)

    def test_canonical_records_are_never_rescaled(self, client_and_token):
        client, token, user_id = client_and_token
        for score, status, _ in CANONICAL_OVERALL:
            _add_record(user_id, overall_score=score, compliance_status=status, assessments=[])

        resp = client.get("/api/v1/compliance/evaluations/history",
                          headers={"Authorization": f"Bearer {token}"})
        rows = {(r["overall_score"], r["compliance_status"]): r for r in resp.json()}
        assert rows[(62.0, "partial")]["overall_score"] == pytest.approx(62.0)
        assert rows[(62.0, "partial")]["compliance_status"] == "partial"
        assert rows[(78.0, "partial")]["overall_score"] == pytest.approx(78.0)
        assert rows[(100.0, "compliant")]["overall_score"] == pytest.approx(100.0)
        assert rows[(0.0, "not_assessed")]["overall_score"] == pytest.approx(0.0)
        # Canonical 1.0 must NOT be treated as a legacy 0-1 value.
        assert rows[(1.0, "non_compliant")]["overall_score"] == pytest.approx(1.0)


class TestAssessmentsNormalization:
    def test_legacy_control_assessments_are_normalized(self, client_and_token):
        client, token, user_id = client_and_token
        eval_id = _add_record(
            user_id, overall_score=0.62, compliance_status="partially_compliant",
            assessments=[("CC1.1", "partially_compliant", 0.5), ("CC1.2", "not_evaluated", 0.0)],
        )
        resp = client.get(f"/api/v1/compliance/evaluations/{eval_id}/control-assessments",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["CC1.1"]["score"] == 50
        assert data["CC1.1"]["status"] == "partial"
        assert data["CC1.2"]["score"] == 0
        assert data["CC1.2"]["status"] == "not_assessed"

    def test_canonical_control_assessments_are_untouched(self, client_and_token):
        client, token, user_id = client_and_token
        eval_id = _add_record(
            user_id, overall_score=62, compliance_status="partial",
            assessments=[("CC1.1", "partial", 50), ("CC1.2", "not_assessed", 0)],
        )
        resp = client.get(f"/api/v1/compliance/evaluations/{eval_id}/control-assessments",
                          headers={"Authorization": f"Bearer {token}"})
        data = resp.json()
        assert data["CC1.1"]["score"] == 50
        assert data["CC1.1"]["status"] == "partial"
        assert data["CC1.2"]["score"] == 0
        assert data["CC1.2"]["status"] == "not_assessed"


class TestTrendNormalization:
    def test_legacy_and_canonical_rows_coexist_in_trend(self, client_and_token):
        client, token, user_id = client_and_token
        _add_record(user_id, overall_score=0.62, compliance_status="partially_compliant",
                    assessments=[("CC1.1", "partially_compliant", 0.62)])
        _add_record(user_id, overall_score=78, compliance_status="partial",
                    assessments=[("CC1.1", "partial", 78)])

        resp = client.get("/api/v1/compliance/controls/CC1.1/trend",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        rows = resp.json()
        scores = sorted(r["score"] for r in rows)
        statuses = {r["status"] for r in rows}
        assert scores == [62, 78]  # legacy 0.62 -> 62, canonical 78 untouched
        assert statuses == {"partial"}


class TestReportNormalization:
    def test_legacy_report_summary_is_normalized(self, client_and_token):
        client, token, user_id = client_and_token
        eval_id = _add_record(user_id, overall_score=0.62, compliance_status="partially_compliant",
                              assessments=[("CC1.1", "partially_compliant", 0.62)])
        resp = client.get(f"/api/v1/compliance/evaluations/{eval_id}/report",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        summary = resp.json()["summary"]
        assert summary["overall_score"] == pytest.approx(62.0)
        assert summary["compliance_status"] == "partial"

    def test_canonical_report_summary_is_untouched(self, client_and_token):
        client, token, user_id = client_and_token
        eval_id = _add_record(user_id, overall_score=78, compliance_status="partial",
                              assessments=[("CC1.1", "partial", 78)])
        resp = client.get(f"/api/v1/compliance/evaluations/{eval_id}/report",
                          headers={"Authorization": f"Bearer {token}"})
        summary = resp.json()["summary"]
        assert summary["overall_score"] == pytest.approx(78.0)
        assert summary["compliance_status"] == "partial"
