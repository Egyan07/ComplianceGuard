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


@pytest.fixture
def auth_token(client):
    """Register a user and return an auth token."""
    res = client.post("/api/auth/register", json={
        "email": "integration@test.com",
        "password": "testpass123",
        "first_name": "Integration",
        "last_name": "Test",
    })
    assert res.status_code == 200
    return res.json()["access_token"]


class TestAuthFlow:
    def test_register_and_login(self, client):
        # Register
        res = client.post("/api/auth/register", json={
            "email": "newuser@test.com",
            "password": "securepass",
            "first_name": "New",
            "last_name": "User",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["user"]["email"] == "newuser@test.com"
        assert "access_token" in data

        # Login with same credentials
        res = client.post("/api/auth/login", data={
            "username": "newuser@test.com",
            "password": "securepass",
        })
        assert res.status_code == 200
        assert "access_token" in res.json()

    def test_login_wrong_password(self, client, auth_token):
        res = client.post("/api/auth/login", data={
            "username": "integration@test.com",
            "password": "wrongpassword",
        })
        assert res.status_code == 401

    def test_duplicate_registration(self, client, auth_token):
        res = client.post("/api/auth/register", json={
            "email": "integration@test.com",
            "password": "anotherpass",
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
        assert data["total_controls"] >= 50

    def test_get_all_controls(self, client):
        res = client.get("/api/v1/compliance/framework/controls")
        assert res.status_code == 200
        controls = res.json()
        assert len(controls) >= 50

    def test_get_controls_by_category(self, client):
        res = client.get("/api/v1/compliance/framework/controls/by-category/CC")
        assert res.status_code == 200
        assert len(res.json()) > 0

    def test_invalid_category(self, client):
        res = client.get("/api/v1/compliance/framework/controls/by-category/INVALID")
        assert res.status_code == 400


class TestHealthEndpoints:
    def test_health_check(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert data["version"] == "2.0.0"

    def test_root(self, client):
        res = client.get("/")
        assert res.status_code == 200
