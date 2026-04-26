"""
Unit tests for auth helpers.

Covers validate_password_strength, edge cases in register/reset-password,
and token endpoints.
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
from app.api.auth import validate_password_strength


# ─── In-memory DB setup ──────────────────────────────────────────────────────

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
def registered_user(client):
    """Register and return a valid user + token."""
    res = client.post("/api/v1/auth/register", json={
        "email": "valid@test.com",
        "password": "Valid@pass1",
        "first_name": "Test",
        "last_name": "User",
    })
    assert res.status_code == 200
    return res.json()


# ─── validate_password_strength ─────────────────────────────────────────────

class TestValidatePasswordStrength:

    def test_valid_password_returns_empty_list(self):
        assert validate_password_strength("Valid@pass1") == []

    def test_too_short_returns_error(self):
        errors = validate_password_strength("Ab@1")
        assert any("characters" in e for e in errors)

    def test_missing_uppercase_returns_error(self):
        errors = validate_password_strength("valid@pass1")
        assert any("uppercase" in e for e in errors)

    def test_missing_lowercase_returns_error(self):
        errors = validate_password_strength("VALID@PASS1")
        assert any("lowercase" in e for e in errors)

    def test_missing_digit_returns_error(self):
        errors = validate_password_strength("Valid@pass")
        assert any("digit" in e for e in errors)

    def test_missing_special_returns_error(self):
        errors = validate_password_strength("Validpass1")
        assert any("special" in e for e in errors)

    def test_multiple_failures_returned(self):
        errors = validate_password_strength("short")
        assert len(errors) > 1

    def test_empty_password_returns_multiple_errors(self):
        errors = validate_password_strength("")
        assert len(errors) >= 4

    def test_exact_min_length_valid(self):
        # Exactly 8 chars with all requirements
        errors = validate_password_strength("Aa@1bcde")
        assert errors == []

    def test_special_chars_accepted(self):
        for char in "!@#$%^&*()":
            errors = validate_password_strength(f"Validpass1{char}")
            assert errors == [], f"Char {char} should be accepted"


# ─── register endpoint ───────────────────────────────────────────────────────

class TestRegisterEndpoint:

    def test_weak_password_rejected(self, client):
        res = client.post("/api/v1/auth/register", json={
            "email": "user@test.com",
            "password": "weakpass",
        })
        assert res.status_code == 400
        assert "Password must contain" in res.json()["detail"]

    def test_no_uppercase_rejected(self, client):
        res = client.post("/api/v1/auth/register", json={
            "email": "user@test.com",
            "password": "valid@pass1",
        })
        assert res.status_code == 400

    def test_no_special_char_rejected(self, client):
        res = client.post("/api/v1/auth/register", json={
            "email": "user@test.com",
            "password": "Validpass1",
        })
        assert res.status_code == 400

    def test_duplicate_email_rejected(self, client, registered_user):
        res = client.post("/api/v1/auth/register", json={
            "email": "valid@test.com",
            "password": "Valid@pass1",
        })
        assert res.status_code == 400
        assert "already exists" in res.json()["detail"]

    def test_successful_register_returns_token(self, client):
        res = client.post("/api/v1/auth/register", json={
            "email": "newuser@test.com",
            "password": "Valid@pass1",
        })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_register_user_not_verified_by_default(self, client):
        res = client.post("/api/v1/auth/register", json={
            "email": "unverified@test.com",
            "password": "Valid@pass1",
        })
        assert res.status_code == 200
        token = res.json()["access_token"]
        status = client.get(
            "/api/v1/auth/verification-status",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert status.json()["is_verified"] is False

    def test_invalid_email_rejected(self, client):
        res = client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "password": "Valid@pass1",
        })
        assert res.status_code == 422


# ─── email verification ──────────────────────────────────────────────────────

class TestEmailVerification:

    def test_invalid_token_returns_400(self, client):
        res = client.post("/api/v1/auth/verify-email", json={"token": "badtoken"})
        assert res.status_code == 400

    def test_valid_token_verifies_user(self, client):
        # Register user and get verification token from DB
        client.post("/api/v1/auth/register", json={
            "email": "verify@test.com",
            "password": "Valid@pass1",
        })
        db = TestSession()
        user = db.query(User).filter(User.email == "verify@test.com").first()
        token = user.verification_token
        db.close()

        res = client.post("/api/v1/auth/verify-email", json={"token": token})
        assert res.status_code == 200
        assert res.json()["message"] == "Email verified successfully"

    def test_token_nulled_after_verification(self, client):
        client.post("/api/v1/auth/register", json={
            "email": "verify2@test.com",
            "password": "Valid@pass1",
        })
        db = TestSession()
        user = db.query(User).filter(User.email == "verify2@test.com").first()
        token = user.verification_token
        db.close()

        client.post("/api/v1/auth/verify-email", json={"token": token})

        db = TestSession()
        user = db.query(User).filter(User.email == "verify2@test.com").first()
        assert user.verification_token is None
        assert user.is_verified is True
        db.close()

    def test_reusing_token_fails(self, client):
        client.post("/api/v1/auth/register", json={
            "email": "verify3@test.com",
            "password": "Valid@pass1",
        })
        db = TestSession()
        user = db.query(User).filter(User.email == "verify3@test.com").first()
        token = user.verification_token
        db.close()

        client.post("/api/v1/auth/verify-email", json={"token": token})
        res = client.post("/api/v1/auth/verify-email", json={"token": token})
        assert res.status_code == 400


# ─── forgot / reset password ─────────────────────────────────────────────────

class TestPasswordReset:

    def test_forgot_password_always_200(self, client):
        res = client.post("/api/v1/auth/forgot-password", json={
            "email": "doesnotexist@test.com"
        })
        assert res.status_code == 200

    def test_forgot_password_registered_user_200(self, client, registered_user):
        res = client.post("/api/v1/auth/forgot-password", json={
            "email": "valid@test.com"
        })
        assert res.status_code == 200

    def test_reset_with_invalid_token_400(self, client):
        res = client.post("/api/v1/auth/reset-password", json={
            "token": "invalidtoken",
            "new_password": "NewValid@1"
        })
        assert res.status_code == 400

    def test_reset_with_weak_password_400(self, client, registered_user):
        client.post("/api/v1/auth/forgot-password", json={"email": "valid@test.com"})
        db = TestSession()
        user = db.query(User).filter(User.email == "valid@test.com").first()
        token = user.reset_token
        db.close()

        res = client.post("/api/v1/auth/reset-password", json={
            "token": token,
            "new_password": "weakpass"
        })
        assert res.status_code == 400
        assert "Password must contain" in res.json()["detail"]

    def test_valid_reset_succeeds(self, client, registered_user):
        client.post("/api/v1/auth/forgot-password", json={"email": "valid@test.com"})
        db = TestSession()
        user = db.query(User).filter(User.email == "valid@test.com").first()
        token = user.reset_token
        db.close()

        res = client.post("/api/v1/auth/reset-password", json={
            "token": token,
            "new_password": "NewValid@1pass"
        })
        assert res.status_code == 200
        assert res.json()["message"] == "Password reset successfully"

    def test_can_login_with_new_password_after_reset(self, client, registered_user):
        client.post("/api/v1/auth/forgot-password", json={"email": "valid@test.com"})
        db = TestSession()
        user = db.query(User).filter(User.email == "valid@test.com").first()
        token = user.reset_token
        db.close()

        client.post("/api/v1/auth/reset-password", json={
            "token": token,
            "new_password": "NewValid@1pass"
        })

        login = client.post("/api/v1/auth/login", data={
            "username": "valid@test.com",
            "password": "NewValid@1pass",
        })
        assert login.status_code == 200

    def test_old_password_fails_after_reset(self, client, registered_user):
        client.post("/api/v1/auth/forgot-password", json={"email": "valid@test.com"})
        db = TestSession()
        user = db.query(User).filter(User.email == "valid@test.com").first()
        token = user.reset_token
        db.close()

        client.post("/api/v1/auth/reset-password", json={
            "token": token,
            "new_password": "NewValid@1pass"
        })

        login = client.post("/api/v1/auth/login", data={
            "username": "valid@test.com",
            "password": "Valid@pass1",
        })
        assert login.status_code == 401

    def test_token_cleared_after_reset(self, client, registered_user):
        client.post("/api/v1/auth/forgot-password", json={"email": "valid@test.com"})
        db = TestSession()
        user = db.query(User).filter(User.email == "valid@test.com").first()
        token = user.reset_token
        db.close()

        client.post("/api/v1/auth/reset-password", json={
            "token": token,
            "new_password": "NewValid@1pass"
        })

        db = TestSession()
        user = db.query(User).filter(User.email == "valid@test.com").first()
        assert user.reset_token is None
        assert user.reset_token_expires is None
        db.close()


# ─── Refresh token tests ─────────────────────────────────────────────────────

from app.core.auth import create_refresh_token, verify_refresh_token


def test_create_refresh_token_returns_string():
    token, jti = create_refresh_token({"sub": "user@example.com"})
    assert isinstance(token, str)
    assert isinstance(jti, str)
    assert len(token) > 20
    assert len(jti) == 64  # 32 bytes hex


def test_verify_refresh_token_valid():
    token, jti = create_refresh_token({"sub": "user@example.com"})
    result = verify_refresh_token(token)
    assert result is not None
    assert result.sub == "user@example.com"
    assert result.jti == jti


def test_verify_refresh_token_rejects_access_token():
    """An access token must not be accepted as a refresh token."""
    from app.core.auth import create_access_token
    access = create_access_token({"sub": "user@example.com"})
    result = verify_refresh_token(access)
    assert result is None


def test_verify_refresh_token_rejects_garbage():
    result = verify_refresh_token("not.a.token")
    assert result is None


def test_verify_refresh_token_rejects_empty():
    result = verify_refresh_token("")
    assert result is None
