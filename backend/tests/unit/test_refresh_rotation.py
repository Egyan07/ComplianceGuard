"""Phase 11 (I): refresh-token rotation & reuse detection regression tests.

Every /auth/refresh must rotate: the presented token is revoked and a new one
issued in the same family. Replaying a rotated token revokes the whole family
and forces reauthentication.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.auth import get_password_hash
from app.models.user import User
from app.models.refresh_token import RefreshToken

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
def client_and_tokens():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    db = TestSession()
    try:
        db.add(User(
            email="rotate@example.com",
            hashed_password=get_password_hash("Rotate@1pass"),
            is_active=True,
            is_verified=True,
        ))
        db.commit()
    finally:
        db.close()

    resp = client.post("/api/v1/auth/login", data={
        "username": "rotate@example.com",
        "password": "Rotate@1pass",
    })
    body = resp.json()
    yield client, body["refresh_token"]
    app.dependency_overrides.clear()


def _refresh(client, token):
    return client.post("/api/v1/auth/refresh", json={"refresh_token": token})


def _db_row(jti_hint=None):
    db = TestSession()
    try:
        return db.query(RefreshToken).all()
    finally:
        db.close()


def _find_row(token):
    # Decode the jti out of the JWT payload to locate the DB row.
    import base64
    import json
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    data = json.loads(base64.urlsafe_b64decode(payload))
    db = TestSession()
    try:
        return db.query(RefreshToken).filter(RefreshToken.jti == data["jti"]).first()
    finally:
        db.close()


class TestRotation:
    def test_refresh_rotates_token(self, client_and_tokens):
        client, token_a = client_and_tokens
        resp = _refresh(client, token_a)
        assert resp.status_code == 200
        body = resp.json()
        assert body["refresh_token"]
        token_b = body["refresh_token"]
        assert token_b != token_a

        # The old token is now revoked; the new one is live.
        row_a = _find_row(token_a)
        assert row_a.is_revoked
        row_b = _find_row(token_b)
        assert not row_b.is_revoked
        assert row_b.family_id == row_a.family_id  # same rotation family

        # The rotated token works for the next refresh.
        assert _refresh(client, token_b).status_code == 200

    def test_replaying_rotated_token_revokes_family(self, client_and_tokens):
        client, token_a = client_and_tokens
        token_b = _refresh(client, token_a).json()["refresh_token"]

        # Replay of the already-rotated token A -> 401 AND family revocation.
        replay = _refresh(client, token_a)
        assert replay.status_code == 401
        # B is now revoked too (same family).
        assert _find_row(token_b).is_revoked
        assert _refresh(client, token_b).status_code == 401

    def test_logout_revoked_token_is_rejected(self, client_and_tokens):
        client, token = client_and_tokens
        assert client.post("/api/v1/auth/logout", json={"refresh_token": token}).status_code == 200
        assert _refresh(client, token).status_code == 401

    def test_expired_token_is_rejected(self, client_and_tokens):
        client, token = client_and_tokens
        import base64
        import json
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        jti = json.loads(base64.urlsafe_b64decode(payload))["jti"]
        db = TestSession()
        try:
            row = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
            row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
            db.commit()
        finally:
            db.close()
        assert _refresh(client, token).status_code == 401

    def test_concurrent_refresh_first_wins_second_is_replay(self, client_and_tokens):
        """Two refreshes with the same token: the first rotates it, the second
        is a replay and is rejected (family revoked) — the deterministic,
        documented behavior for identical-token races."""
        client, token_a = client_and_tokens
        assert _refresh(client, token_a).status_code == 200
        second = _refresh(client, token_a)
        assert second.status_code == 401

    def test_cookie_flow_rotates_the_cookie(self, client_and_tokens):
        """Web flow: refresh via the HttpOnly cookie sets a NEW cookie."""
        client, _ = client_and_tokens
        # Login set the cookie; read it.
        cookie = client.cookies.get("refresh_token")
        assert cookie
        resp = client.post("/api/v1/auth/refresh", json={})  # cookie rides along
        assert resp.status_code == 200
        new_cookie = client.cookies.get("refresh_token")
        assert new_cookie and new_cookie != cookie

    def test_refresh_token_never_reused_across_families(self, client_and_tokens):
        """A rotated token must not be valid in another family (jti unique)."""
        client, token_a = client_and_tokens
        token_b = _refresh(client, token_a).json()["refresh_token"]
        # Log in again -> a new family with a fresh token C.
        resp = client.post("/api/v1/auth/login", data={
            "username": "rotate@example.com",
            "password": "Rotate@1pass",
        })
        token_c = resp.json()["refresh_token"]
        assert _find_row(token_b).family_id != _find_row(token_c).family_id
        # A was revoked by the rotation; B (the rotated token) and C are live.
        assert _find_row(token_a).is_revoked
        assert not _find_row(token_b).is_revoked
        assert not _find_row(token_c).is_revoked
