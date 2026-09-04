"""
CG-H1 regression: the default EMAIL_ENABLED=false configuration must not
dead-end registration.

With email delivery disabled the backend logs the verification link in
non-production environments (app.core.email — deterministically covered in
tests/unit/test_email_delivery.py). This test drives the REAL web flow
without any is_verified=True fixture shortcut:

    register (EMAIL_ENABLED=false)
    -> 403 on a protected endpoint
    -> verify-email with the persisted verification token
       (the exact token the dev-mode logged link embeds)
    -> the same access token now reaches the protected endpoint

The token is read from the persisted user record rather than parsed out of
process logs: pytest's logging capture and app.core.observability's
root-handler replacement (configure_logging) interact non-deterministically in
a shared test session, while the log channel itself is already asserted
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


def _current_verification_token(email: str) -> str:
    """Read the user's current verification token from the test DB.

    With EMAIL_ENABLED=false no email is sent; the same token is what the
    backend logs as the verification link in non-production (the mechanism
    covered in tests/unit/test_email_delivery.py).
    """
    from app.models.user import User
    db = TestSession()
    try:
        user = db.query(User).filter(User.email == email).first()
        assert user is not None, f"user {email} not found"
        assert user.is_verified is False, "user should still be unverified"
        assert user.verification_token, "expected a pending verification token"
        return user.verification_token
    finally:
        db.close()


class TestRegistrationWithEmailDisabled:
    def test_full_flow_register_verify_protected_endpoint(self, client):
        # 1. Register (EMAIL_ENABLED=false — the shipped default).
        data = _register(client, "flow@test.com")
        token = data["access_token"]
        assert data["user"]["email"] == "flow@test.com"

        # 2. Before verification every protected endpoint is 403.
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 403
        assert "Email address not verified" in me.json()["detail"]

        # 3. Complete verification with the surfaced token.
        v_token = _current_verification_token("flow@test.com")
        res = client.post("/api/v1/auth/verify-email", json={"token": v_token})
        assert res.status_code == 200, res.text

        # 4. The same access token now reaches the protected endpoint.
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["email"] == "flow@test.com"

    def test_resend_verification_rotates_token_and_can_complete(self, client):
        data = _register(client, "resend@test.com")
        token = data["access_token"]
        first_token = _current_verification_token("resend@test.com")

        res = client.post(
            "/api/v1/auth/resend-verification",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text

        # The resend rotates the token: the old one no longer verifies, the
        # new one does.
        second_token = _current_verification_token("resend@test.com")
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
