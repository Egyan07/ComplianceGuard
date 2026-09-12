"""
Integration tests for ComplianceGuard API.

Tests auth flow, evidence endpoints, and compliance endpoints
against a real SQLite database.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db


# In-memory SQLite for integration tests
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


def _register_and_verify(client, email: str, password: str, email_tokens=None, **extra) -> str:
    """Register a user, verify their email via a captured token, and return the access token."""
    res = client.post("/api/v1/auth/register", json={
        "email": email, "password": password, **extra,
    })
    assert res.status_code == 200
    token = res.json()["access_token"]

    # M-2: only a hash of the token is in the DB; the raw token was handed to
    # the email layer. Verify with the captured raw token when available,
    # else flip the flag directly (no real email delivery in tests).
    from app.models.user import User as UserModel
    v_token = (email_tokens or {}).get(email)
    if v_token:
        client.post("/api/v1/auth/verify-email", json={"token": v_token})
    else:
        db = TestSession()
        user = db.query(UserModel).filter(UserModel.email == email).first()
        user.is_verified = True
        db.commit()
        db.close()

    return token


@pytest.fixture
def auth_token(client, email_tokens):
    """Register+verify a user and return an auth token."""
    return _register_and_verify(
        client, "integration@test.com", "Test@pass1",
        email_tokens=email_tokens,
        first_name="Integration", last_name="Test",
    )


class TestAuthFlow:
    def test_register_and_login(self, client):
        # Register
        res = client.post("/api/v1/auth/register", json={
            "email": "newuser@test.com",
            "password": "Secure@1pass",
            "first_name": "New",
            "last_name": "User",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["user"]["email"] == "newuser@test.com"
        assert "access_token" in data

        # Login with same credentials
        res = client.post("/api/v1/auth/login", data={
            "username": "newuser@test.com",
            "password": "Secure@1pass",
        })
        assert res.status_code == 200
        assert "access_token" in res.json()

    def test_login_wrong_password(self, client, auth_token):
        res = client.post("/api/v1/auth/login", data={
            "username": "integration@test.com",
            "password": "wrongpassword",
        })
        assert res.status_code == 401

    def test_weak_password_rejected(self, client):
        res = client.post("/api/v1/auth/register", json={
            "email": "weak@test.com",
            "password": "short",
            "first_name": "Weak",
            "last_name": "Pass",
        })
        assert res.status_code == 400
        assert "Password must contain" in res.json()["detail"]

    def test_email_verification_flow(self, client, email_tokens):
        # Register
        res = client.post("/api/v1/auth/register", json={
            "email": "verify@test.com",
            "password": "Verify@1pass",
            "first_name": "Verify",
            "last_name": "User",
        })
        assert res.status_code == 200
        token = res.json()["access_token"]

        # Check not verified yet
        res = client.get("/api/v1/auth/verification-status", headers={
            "Authorization": f"Bearer {token}",
        })
        assert res.status_code == 200
        assert res.json()["is_verified"] is False

        # M-2: the DB row holds only a hash; the raw token went to the email layer.
        v_token = email_tokens.get("verify@test.com")
        assert v_token, "verification email must have been captured"

        # Verify
        res = client.post("/api/v1/auth/verify-email", json={"token": v_token})
        assert res.status_code == 200
        assert res.json()["message"] == "Email verified successfully"

        # Check verified now
        res = client.get("/api/v1/auth/verification-status", headers={
            "Authorization": f"Bearer {token}",
        })
        assert res.json()["is_verified"] is True

    def test_invalid_verification_token(self, client):
        res = client.post("/api/v1/auth/verify-email", json={"token": "bogus-token"})
        assert res.status_code == 400

    def test_password_reset_flow(self, client, email_tokens):
        # Register a user first
        client.post("/api/v1/auth/register", json={
            "email": "reset@test.com",
            "password": "Reset@1pass",
            "first_name": "Reset",
            "last_name": "User",
        })

        # Request reset
        res = client.post("/api/v1/auth/forgot-password", json={"email": "reset@test.com"})
        assert res.status_code == 200

        # M-2: the DB row holds only a hash; the raw token went to the email layer.
        reset_tok = email_tokens.get("reset@test.com")
        assert reset_tok, "reset email must have been captured"

        # Reset password
        res = client.post("/api/v1/auth/reset-password", json={
            "token": reset_tok,
            "new_password": "NewReset@1pass",
        })
        assert res.status_code == 200
        assert res.json()["message"] == "Password reset successfully"

        # Login with new password
        res = client.post("/api/v1/auth/login", data={
            "username": "reset@test.com",
            "password": "NewReset@1pass",
        })
        assert res.status_code == 200

    def test_invalid_reset_token(self, client):
        res = client.post("/api/v1/auth/reset-password", json={
            "token": "bogus",
            "new_password": "New@1pass",
        })
        assert res.status_code == 400

    def test_forgot_password_nonexistent_email(self, client):
        # Should still return 200 to avoid leaking user existence
        res = client.post("/api/v1/auth/forgot-password", json={"email": "nobody@test.com"})
        assert res.status_code == 200

    def test_duplicate_registration(self, client, auth_token):
        res = client.post("/api/v1/auth/register", json={
            "email": "integration@test.com",
            "password": "Another@1pass",
            "first_name": "Dup",
            "last_name": "User",
        })
        assert res.status_code == 400


class TestEvidenceEndpoints:
    def test_evidence_summary_empty(self, client, auth_token):
        res = client.get("/api/v1/evidence/summary", headers={
            "Authorization": f"Bearer {auth_token}",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["total_collections"] == 0
        assert data["total_evidence_items"] == 0

    def test_evidence_items_empty(self, client, auth_token):
        res = client.get("/api/v1/evidence/items", headers={
            "Authorization": f"Bearer {auth_token}",
        })
        assert res.status_code == 200
        assert res.json() == []

    def test_evidence_collections_empty(self, client, auth_token):
        res = client.get("/api/v1/evidence/collections", headers={
            "Authorization": f"Bearer {auth_token}",
        })
        assert res.status_code == 200
        assert res.json() == []

    def test_evidence_status_not_found(self, client, auth_token):
        res = client.get("/api/v1/evidence/status/nonexistent", headers={
            "Authorization": f"Bearer {auth_token}",
        })
        assert res.status_code == 404

    def test_unauthorized_access(self, client):
        res = client.get("/api/v1/evidence/summary")
        assert res.status_code == 401


class TestComplianceEndpoints:
    def test_framework_summary(self, client):
        res = client.get("/api/v1/compliance/framework/summary")
        assert res.status_code == 200
        data = res.json()
        # The canonical 2017 TSC taxonomy: 33 CC + 3 A + 2 C + 5 PI = 43.
        # (>= 50 encoded the pre-remediation fabricated framework.)
        assert data["total_controls"] == 43

    def test_get_all_controls(self, client):
        res = client.get("/api/v1/compliance/framework/controls")
        assert res.status_code == 200
        controls = res.json()
        assert len(controls) == 43

    def test_get_controls_by_category(self, client):
        res = client.get("/api/v1/compliance/framework/controls/by-category/CC")
        assert res.status_code == 200
        assert len(res.json()) > 0

    def test_invalid_category(self, client):
        res = client.get("/api/v1/compliance/framework/controls/by-category/INVALID")
        assert res.status_code == 400

    def test_evaluation_history_requires_pro(self, client, auth_token):
        """Free-tier users (default) must get 402 on evaluation history."""
        res = client.get(
            "/api/v1/compliance/evaluations/history",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert res.status_code == 402

    def test_control_assessments_requires_pro(self, client, auth_token):
        """Free-tier users must get 402 on per-control assessment breakdown."""
        res = client.get(
            "/api/v1/compliance/evaluations/some-eval-id/control-assessments",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert res.status_code == 402

    def test_compliance_report_requires_pro(self, client, auth_token):
        """Free-tier users must get 402 on the compliance report endpoint."""
        res = client.get(
            "/api/v1/compliance/evaluations/some-eval-id/report",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert res.status_code == 402

    def test_control_trend_requires_pro(self, client, auth_token):
        """Free-tier users must get 402 on control trend endpoint."""
        res = client.get(
            "/api/v1/compliance/controls/CC1.1/trend",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert res.status_code == 402


class TestIDORProtection:
    """Verify that Pro endpoints scope results to the authenticated user.

    A Pro user (user A) who knows another user's evaluation_id must receive a
    404 — the server must not leak that the evaluation even exists.
    """

    def _register_pro_user(self, client, email: str, email_tokens=None) -> str:
        """Register+verify a user, upgrade to Pro, and return their token."""
        from app.models.user import User
        token = _register_and_verify(
            client, email, "ProUser@1pass", email_tokens=email_tokens,
            first_name="Pro", last_name="User",
        )

        # Promote to Pro directly in the test DB.
        db = TestSession()
        user = db.query(User).filter(User.email == email).first()
        user.license_tier = "pro"
        db.commit()
        db.close()

        return token

    def _submit_evaluation(self, client, token: str) -> str:
        """Submit a minimal compliance evaluation and return the evaluation_id."""
        res = client.post(
            "/api/v1/compliance/evaluate",
            json={
                "evidence_data": {
                    "CC1.1": {
                        "evidence_provided": ["e1"],
                        "status": "compliant",
                        "score": 1.0,
                        "comments": "ok",
                    }
                },
                "evaluated_by": "test",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        return res.json()["framework_id"]  # we only need the eval id from DB

    def test_user_b_cannot_read_user_a_control_assessments(self, client, email_tokens):
        """User B gets 404 when requesting User A's evaluation control assessments."""
        token_a = self._register_pro_user(client, "user_a_idor@test.com", email_tokens=email_tokens)
        token_b = self._register_pro_user(client, "user_b_idor@test.com", email_tokens=email_tokens)

        # User A submits an evaluation — retrieve the evaluation_id from the DB.
        client.post(
            "/api/v1/compliance/evaluate",
            json={
                "evidence_data": {
                    "CC1.1": {
                        "evidence_provided": ["e1"],
                        "status": "compliant",
                        "score": 1.0,
                        "comments": "ok",
                    }
                },
                "evaluated_by": "user_a",
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )

        from app.models.evaluation import ComplianceEvaluationRecord
        from app.models.user import User
        db = next(override_get_db())
        user_a = db.query(User).filter(User.email == "user_a_idor@test.com").first()
        record = (
            db.query(ComplianceEvaluationRecord)
            .filter(ComplianceEvaluationRecord.user_id == user_a.id)
            .first()
        )
        eval_id = record.evaluation_id
        db.close()

        # User B tries to read User A's evaluation — must get 404.
        res = client.get(
            f"/api/v1/compliance/evaluations/{eval_id}/control-assessments",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert res.status_code == 404

    def test_user_b_cannot_read_user_a_report(self, client, email_tokens):
        """User B gets 404 when requesting User A's evaluation report."""
        token_a = self._register_pro_user(client, "user_a_report@test.com", email_tokens=email_tokens)
        token_b = self._register_pro_user(client, "user_b_report@test.com", email_tokens=email_tokens)

        client.post(
            "/api/v1/compliance/evaluate",
            json={
                "evidence_data": {
                    "CC1.1": {
                        "evidence_provided": ["e1"],
                        "status": "compliant",
                        "score": 1.0,
                        "comments": "ok",
                    }
                },
                "evaluated_by": "user_a",
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )

        from app.models.evaluation import ComplianceEvaluationRecord
        from app.models.user import User
        db = next(override_get_db())
        user_a = db.query(User).filter(User.email == "user_a_report@test.com").first()
        record = (
            db.query(ComplianceEvaluationRecord)
            .filter(ComplianceEvaluationRecord.user_id == user_a.id)
            .first()
        )
        eval_id = record.evaluation_id
        db.close()

        res = client.get(
            f"/api/v1/compliance/evaluations/{eval_id}/report",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert res.status_code == 404


class TestHealthEndpoints:
    def test_health_check(self, client):
        from app.core.constants import VERSION

        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert data["version"] == VERSION
        assert "git_sha" in data
        assert "started_at" in data

    def test_root(self, client):
        res = client.get("/")
        assert res.status_code == 200
