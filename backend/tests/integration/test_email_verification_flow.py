"""
Email-verification gate semantics.

The verification GATE is enforced only when the deployment actually sends
email (EMAIL_ENABLED=true). With the shipped default (EMAIL_ENABLED=false)
no verification message can ever arrive, so demanding verification would
403 every request from every fresh account forever — the registration
dead-end that made web mode unusable out of the box.

Correct invariants, both driven through the REAL flow (no is_verified=True
fixture shortcut):

  EMAIL_ENABLED=false  register -> protected endpoint 200 immediately;
                       verification-status still reports False until the
                       token flow completes.
  EMAIL_ENABLED=true   register -> protected endpoint 403 -> verify-email
                       with the captured token -> 200.

The token is read from the captured email-layer call rather than parsed out
of process logs: pytest's logging capture and app.core.observability's
root-handler replacement (configure_logging) interact non-deterministically
in a shared test session, while the log channel itself is asserted
deterministically in the unit tests.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.config import settings
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
    # Deterministic: the default config under test is email DISABLED.
    settings.email_enabled = False
    yield
    settings.email_enabled = False
    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _register(client, email: str) -> dict:
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Secure@1pass",
            "first_name": "Flow",
            "last_name": "Test",
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


def _current_verification_token(email: str, email_tokens=None) -> str:
    """Return the user's current raw verification token.

    M-2: the DB row holds only a SHA-256 hash of the token — the raw value is
    handed to the email layer, where the ``email_tokens`` fixture captures it.
    """
    from app.models.user import User
    db = TestSession()
    try:
        user = db.query(User).filter(User.email == email).first()
        assert user is not None, f"user {email} not found"
        assert user.is_verified is False, "user should still be unverified"
        assert user.verification_token, "expected a pending verification token (hash in DB)"
        assert email_tokens is not None, "email_tokens fixture required to read the raw token"
        token = email_tokens.get(email)
        assert token, f"no verification token captured for {email}"
        return token
    finally:
        db.close()


class TestRegistrationWithEmailDisabled:
    def test_email_disabled_gate_is_not_enforced(self, client, email_tokens):
        """EMAIL_ENABLED=false must not dead-end registration.

        No verification email can ever be sent, so enforcing the gate would
        403 every request from every fresh account forever. The endpoint must
        work immediately; the verification flow itself stays available.
        """
        # 1. Register (EMAIL_ENABLED=false — the shipped default).
        data = _register(client, "flow@test.com")
        token = data["access_token"]
        assert data["user"]["email"] == "flow@test.com"

        # 2. The protected endpoint works immediately — no dead end.
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["email"] == "flow@test.com"

        # 3. The account is still honestly reported as unverified, and the
        #    verification flow remains completable for when email is enabled.
        status_res = client.get(
            "/api/v1/auth/verification-status",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert status_res.status_code == 200
        assert status_res.json()["is_verified"] is False

        v_token = _current_verification_token("flow@test.com", email_tokens)
        res = client.post("/api/v1/auth/verify-email", json={"token": v_token})
        assert res.status_code == 200, res.text

        status_res = client.get(
            "/api/v1/auth/verification-status",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert status_res.json()["is_verified"] is True


class TestRegistrationWithEmailEnabled:
    def test_email_enabled_gate_is_enforced(self, client, email_tokens):
        """EMAIL_ENABLED=true keeps the pre-use gate: 403 until verified."""
        settings.email_enabled = True
        try:
            data = _register(client, "gated@test.com")
            token = data["access_token"]

            # Before verification the protected endpoint is 403.
            me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
            assert me.status_code == 403
            assert "Email address not verified" in me.json()["detail"]

            # Complete verification with the captured token.
            v_token = _current_verification_token("gated@test.com", email_tokens)
            res = client.post("/api/v1/auth/verify-email", json={"token": v_token})
            assert res.status_code == 200, res.text

            # The same access token now reaches the protected endpoint.
            me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
            assert me.status_code == 200
            assert me.json()["email"] == "gated@test.com"
        finally:
            settings.email_enabled = False

    def test_resend_verification_rotates_token_and_can_complete(self, client, email_tokens):
        data = _register(client, "resend@test.com")
        token = data["access_token"]
        first_token = _current_verification_token("resend@test.com", email_tokens)

        res = client.post(
            "/api/v1/auth/resend-verification",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text

        # The resend rotates the token: the old one no longer verifies, the
        # new one does.
        second_token = _current_verification_token("resend@test.com", email_tokens)
        assert second_token != first_token

        old = client.post("/api/v1/auth/verify-email", json={"token": first_token})
        assert old.status_code == 400  # rotated token invalidated

        fresh = client.post("/api/v1/auth/verify-email", json={"token": second_token})
        assert fresh.status_code == 200, fresh.text
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200

    def test_invalid_token_still_rejected(self, client):
        res = client.post("/api/v1/auth/verify-email", json={"token": "not-a-real-token"})
        assert res.status_code == 400
        assert "Invalid or expired verification token" in res.json()["detail"]
