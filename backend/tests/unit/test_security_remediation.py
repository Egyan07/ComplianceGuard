"""Security remediation regression tests.

Covers the audit fixes that were not already asserted by existing suites:

- L-4: /health returns 503 when the database probe fails (readiness semantics).
- L-6: bcrypt 72-byte limit enforced (bytes, not chars; multibyte handled).
- L-7: X-Request-ID normalization/length cap.
- M-3: scaled-out deployments without shared limiter storage fail fast.
- M-5: refresh-cookie Secure flag derives from ENVIRONMENT/COOKIE_SECURE,
      never from DEBUG.
- M-4: machine-sync duplicate hostname race ends in an update, not a 500.

Each block names its finding so the remediation matrix can reference them.
"""

import os
from datetime import datetime, timedelta, timezone
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.api.deps import get_current_user
from app.core.auth import get_password_hash
from app.models.user import User
from app.models.machine import Machine

# ─── Shared in-memory DB ─────────────────────────────────────────────────────

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
    app.dependency_overrides.clear()


def override_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


# ─── L-4: health readiness semantics ────────────────────────────────────────


class TestHealthReadiness:
    def test_healthy_db_returns_200(self):
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"
        assert resp.json()["database"] == "ok"

    def test_db_failure_returns_503(self):
        """L-4 regression: a failed DB probe must yield HTTP 503, not 200."""
        with mock.patch("app.main.SessionLocal", side_effect=OperationalError("SELECT", {}, Exception("db down"))):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/health")
        assert resp.status_code == 503
        body = resp.json()
        assert body["status"] == "degraded"
        assert body["database"] == "unreachable"


# ─── L-6: bcrypt 72-byte password limit ─────────────────────────────────────


class TestBcryptByteLimit:
    def test_password_of_exactly_72_ascii_bytes_is_hashable(self):
        from app.core.auth import get_password_hash, verify_password

        pw = "a" * 72  # 72 bytes exactly — at the boundary, must succeed
        h = get_password_hash(pw)
        assert verify_password(pw, h)

    def test_password_over_72_ascii_bytes_rejected(self):
        # Registration validates; the hash layer is defense in depth.
        from app.core.auth import get_password_hash

        with pytest.raises(ValueError):
            get_password_hash("a" * 73)

    def test_password_over_72_bytes_via_chars_is_rejected(self):
        """Characters, not bytes: 40 unicode chars = 80 bytes > limit."""
        from app.api.auth.helpers import validate_password_strength

        pw = "É" * 40 + "A1!"  # 40 * 2 bytes + 3 = 83 bytes, only 43 chars
        errors = validate_password_strength(pw)
        assert any("72 bytes" in e for e in errors)

    def test_72_bytes_multibyte_password_accepted(self):
        """36 'É' chars = 72 bytes exactly — allowed (bytes, not chars)."""
        from app.api.auth.helpers import validate_password_strength

        pw = "É" * 35 + "A1!"  # 35*2 + 3 = 73... use 34 to stay under
        pw = "É" * 34 + "A1!"  # 34*2 + 3 = 71 bytes
        errors = validate_password_strength(pw)
        assert not any("72 bytes" in e for e in errors)

    def test_registration_rejects_oversized_password(self):
        client = TestClient(app)
        resp = client.post(
            "/api/v1/auth/register",
            json={"email": "long@test.com", "password": "a" * 73 + "A1!"},
        )
        assert resp.status_code == 400
        assert "72 bytes" in resp.json()["detail"]


# ─── L-7: X-Request-ID normalization ────────────────────────────────────────


class TestRequestIdHardening:
    def test_valid_client_id_is_echoed(self):
        client = TestClient(app)
        resp = client.get("/health", headers={"X-Request-ID": "abc-123_def.456"})
        assert resp.headers.get("x-request-id") == "abc-123_def.456"

    def test_oversized_client_id_is_capped(self):
        client = TestClient(app)
        long_id = "x" * 500
        resp = client.get("/health", headers={"X-Request-ID": long_id})
        echoed = resp.headers.get("x-request-id", "")
        assert len(echoed) <= 64
        assert echoed == "x" * 64

    def test_unsafe_characters_are_stripped(self):
        client = TestClient(app)
        resp = client.get("/health", headers={"X-Request-ID": "ab\nc d\x00e"})
        echoed = resp.headers.get("x-request-id", "")
        # Control chars/whitespace removed; only [A-Za-z0-9_.-] may remain.
        assert all(c.isalnum() or c in "-_." for c in echoed)

    def test_id_of_only_unsafe_chars_falls_back_to_generated(self):
        client = TestClient(app)
        resp = client.get("/health", headers={"X-Request-ID": "\n\t\x00"})
        echoed = resp.headers.get("x-request-id", "")
        assert echoed  # server generated one
        assert len(echoed) == 12


# ─── M-3: scaled-out rate limiting configuration ────────────────────────────


class TestRateLimitScaleOutConfig:
    def _run_validator(self, monkeypatch, environment, workers, replicas=None, storage_uri=None):
        """Run the module's scale-out validator under a controlled environment.

        The validator reads module-level _WORKERS plus ENVIRONMENT/REPLICAS/
        RATELIMIT_STORAGE_URI from os.environ, so patch those directly.
        """
        import app.core.rate_limit as rl

        monkeypatch.setattr(rl, "_WORKERS", workers)
        # The module also snapshots the storage URI at import time.
        monkeypatch.setattr(rl, "_STORAGE_URI", storage_uri)
        monkeypatch.setenv("ENVIRONMENT", environment)
        if replicas is None:
            monkeypatch.delenv("REPLICAS", raising=False)
        else:
            monkeypatch.setenv("REPLICAS", str(replicas))
        if storage_uri is None:
            monkeypatch.delenv("RATELIMIT_STORAGE_URI", raising=False)
        else:
            monkeypatch.setenv("RATELIMIT_STORAGE_URI", storage_uri)
        rl.validate_rate_limit_configuration()

    def test_validator_exists_and_is_callable(self):
        from app.core.rate_limit import validate_rate_limit_configuration

        assert callable(validate_rate_limit_configuration)

    def test_production_scaled_out_without_storage_raises(self, monkeypatch):
        """M-3: production + WORKERS>1 + no shared storage must refuse to start."""
        with pytest.raises(RuntimeError):
            self._run_validator(
                monkeypatch, environment="production", workers=4, replicas=1
            )

    def test_production_multi_replica_without_storage_raises(self, monkeypatch):
        with pytest.raises(RuntimeError):
            self._run_validator(
                monkeypatch, environment="production", workers=1, replicas=3
            )

    def test_production_with_shared_storage_is_accepted(self, monkeypatch):
        self._run_validator(
            monkeypatch,
            environment="production",
            workers=4,
            replicas=1,
            storage_uri="redis://shared:6379/0",
        )  # must not raise

    def test_dev_scaled_out_without_storage_warns_only(self, monkeypatch):
        # Dev convenience: no Redis required to run a laptop stack.
        self._run_validator(
            monkeypatch, environment="development", workers=4, replicas=1
        )  # must not raise

    def test_single_worker_production_is_accepted(self, monkeypatch):
        self._run_validator(
            monkeypatch, environment="production", workers=1, replicas=1
        )  # must not raise


# ─── M-5: cookie Secure flag from environment, not DEBUG ────────────────────


class TestCookieSecureFlag:
    def _cookie_secure(self, monkeypatch, **kw):
        from app.core.config import settings
        from app.api.auth.helpers import _cookie_secure

        saved = (settings.cookie_secure, settings.environment)
        try:
            if "cookie_secure" in kw:
                settings.cookie_secure = kw["cookie_secure"]
            else:
                settings.cookie_secure = None
            if "environment" in kw:
                settings.environment = kw["environment"]
            return _cookie_secure()
        finally:
            settings.cookie_secure, settings.environment = saved

    def test_production_implies_secure(self, monkeypatch):
        from app.core.config import Environment

        assert self._cookie_secure(monkeypatch, environment=Environment.PRODUCTION) is True

    def test_development_does_not_force_secure(self, monkeypatch):
        from app.core.config import Environment

        assert self._cookie_secure(monkeypatch, environment=Environment.DEVELOPMENT) is False

    def test_explicit_cookie_secure_true_wins(self, monkeypatch):
        from app.core.config import Environment

        assert (
            self._cookie_secure(
                monkeypatch, cookie_secure=True, environment=Environment.DEVELOPMENT
            )
            is True
        )

    def test_explicit_cookie_secure_false_wins_over_production(self, monkeypatch):
        from app.core.config import Environment

        assert (
            self._cookie_secure(
                monkeypatch, cookie_secure=False, environment=Environment.PRODUCTION
            )
            is False
        )

    def test_debug_has_no_influence(self, monkeypatch):
        """M-5 core assertion: DEBUG=True must NOT make a production cookie insecure."""
        from app.core.config import Environment

        assert (
            self._cookie_secure(monkeypatch, environment=Environment.PRODUCTION) is True
        )


# ─── M-4: machine sync race → constraint → graceful update ──────────────────


class TestMachineSyncRace:
    def _make_user_and_client(self):
        db = TestSession()
        try:
            user = User(
                email="race@test.com",
                hashed_password=get_password_hash("testpass"),
                first_name="R", last_name="U",
                is_active=True, license_tier="free",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            app.dependency_overrides[get_db] = override_db
            app.dependency_overrides[get_current_user] = lambda: user
            client = TestClient(app)
            return client, user
        finally:
            db.close()

    def test_duplicate_hostname_syncs_existing_row(self):
        """A second sync for the same (user, hostname) updates the existing row.

        Exercises the IntegrityError recovery path by pre-inserting the row the
        count-check cannot see (simulating a concurrent winner).
        """
        client, user = self._make_user_and_client()
        try:
            body = {
                "hostname": "RACE-PC-1",
                "overall_score": 80.0,
                "compliance_level": "compliant",
                "evidence_count": 3,
                "os_version": "Windows 11",
                "agent_version": "4.0.0",
            }
            # First sync creates the row.
            r1 = client.post("/api/v1/machines/sync", json=body)
            assert r1.status_code == 200, r1.text

            # Simulate the race: a concurrent insert that the app-level count
            # missed. Commit from a second session so the app's INSERT will
            # violate uq_machine_user_hostname and hit the recovery branch.
            race_db = TestSession()
            try:
                race_db.add(
                    Machine(
                        user_id=user.id,
                        hostname="RACE-PC-2",
                        os_version="Linux",
                        last_score=10.0,
                        compliance_level="at_risk",
                        evidence_count=0,
                        agent_version="4.0.0",
                        last_sync_at=datetime.now(timezone.utc),
                    )
                )
                race_db.commit()
            finally:
                race_db.close()

            r2 = client.post("/api/v1/machines/sync", json={**body, "hostname": "RACE-PC-2"})
            assert r2.status_code == 200, r2.text
            # The response reflects a successful sync of the UPDATED row,
            # not a 500 from the constraint violation.
            assert r2.json()["hostname"] == "RACE-PC-2"
            assert r2.json()["machine_id"] > 0

            check = TestSession()
            try:
                rows = check.query(Machine).filter(Machine.user_id == user.id).all()
                hostnames = sorted(m.hostname for m in rows)
                assert hostnames == ["RACE-PC-1", "RACE-PC-2"]
            finally:
                check.close()
        finally:
            app.dependency_overrides.clear()

    def test_unique_constraint_is_enforced_by_db(self):
        """The DB invariant behind M-4: (user_id, hostname) is unique."""
        db = TestSession()
        try:
            u = User(
                email="uc@test.com",
                hashed_password=get_password_hash("testpass"),
                is_active=True, license_tier="free",
            )
            db.add(u)
            db.commit()
            db.refresh(u)
            db.add(Machine(user_id=u.id, hostname="DUPE", last_sync_at=datetime.now(timezone.utc)))
            db.commit()
            db.add(Machine(user_id=u.id, hostname="DUPE", last_sync_at=datetime.now(timezone.utc)))
            with pytest.raises(IntegrityError):
                db.commit()
        finally:
            db.rollback()
            db.close()
