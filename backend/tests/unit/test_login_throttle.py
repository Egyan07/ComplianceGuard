"""Phase 11 (J): account-aware login throttle regression tests.

The throttle must:
  - block an account after repeated failures without a username-enumeration
    side channel (identical 401 response),
  - recover automatically once the window slides (no permanent lockout),
  - reset on a successful login,
  - not depend on which IP the attempts come from (per-account, not per-IP).
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.auth import get_password_hash
from app.core import login_throttle
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
def client_and_users():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    db = TestSession()
    try:
        db.add(User(
            email="throttle@example.com",
            hashed_password=get_password_hash("Throttle@1pass"),
            is_active=True,
            is_verified=True,
        ))
        db.commit()
    finally:
        db.close()
    yield client
    app.dependency_overrides.clear()


def _login(client, email="throttle@example.com", password="wrong-pass"):
    return client.post("/api/v1/auth/login", data={"username": email, "password": password})


class TestAccountThrottle:
    def test_account_is_throttled_after_max_failures(self, client_and_users, monkeypatch):
        client = client_and_users
        clock = {"t": 0.0}
        monkeypatch.setattr(login_throttle, "_now", lambda: clock["t"])

        for _ in range(login_throttle.MAX_FAILED_ATTEMPTS):
            assert _login(client).status_code == 401

        # The next attempt — from a DIFFERENT client/IP — is still blocked.
        second_client = TestClient(app)
        resp = _login(second_client)
        assert resp.status_code == 401
        # Same generic body as a plain wrong password: no enumeration.
        assert resp.json()["detail"] == "Incorrect email or password"
        assert resp.headers.get("www-authenticate") == "Bearer"

    def test_no_enumeration_when_throttled(self, client_and_users, monkeypatch):
        """A throttled EXISTING account is indistinguishable from a non-existent one."""
        client = client_and_users
        clock = {"t": 0.0}
        monkeypatch.setattr(login_throttle, "_now", lambda: clock["t"])
        for _ in range(login_throttle.MAX_FAILED_ATTEMPTS):
            _login(client)

        throttled = _login(client)
        non_existent = _login(client, email="nobody@example.com")
        assert throttled.status_code == non_existent.status_code == 401
        assert throttled.json() == non_existent.json()

    def test_throttle_is_windowed_and_recovers(self, client_and_users, monkeypatch):
        client = client_and_users
        clock = {"t": 0.0}
        monkeypatch.setattr(login_throttle, "_now", lambda: clock["t"])

        for _ in range(login_throttle.MAX_FAILED_ATTEMPTS):
            _login(client)
        assert _login(client).status_code == 401

        # After the window slides out, the account recovers (no permanent lockout).
        clock["t"] += login_throttle.WINDOW_SECONDS + 1
        resp = _login(client, password="Throttle@1pass")
        assert resp.status_code == 200

    def test_successful_login_clears_the_counter(self, client_and_users, monkeypatch):
        client = client_and_users
        clock = {"t": 0.0}
        monkeypatch.setattr(login_throttle, "_now", lambda: clock["t"])

        for _ in range(login_throttle.MAX_FAILED_ATTEMPTS - 1):
            assert _login(client).status_code == 401

        # A successful login resets the counter before it would hit the max.
        assert _login(client, password="Throttle@1pass").status_code == 200
        assert login_throttle.is_throttled("throttle@example.com") is False

    def test_email_normalization_groups_variants(self, client_and_users, monkeypatch):
        """Upper-case / padded emails map to the same account throttle bucket."""
        client = client_and_users
        clock = {"t": 0.0}
        monkeypatch.setattr(login_throttle, "_now", lambda: clock["t"])

        for i in range(login_throttle.MAX_FAILED_ATTEMPTS):
            variant = ["THROTTLE@EXAMPLE.COM", " throttle@example.com "][i % 2]
            assert _login(client, email=variant).status_code == 401
        assert _login(client).status_code == 401  # throttled regardless of casing
