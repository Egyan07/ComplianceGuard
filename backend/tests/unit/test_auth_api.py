"""
Tests for authentication API endpoints.

This module contains tests for login and registration API endpoints
using JWT-based authentication.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.models.user import User
from app.core.auth import get_password_hash


# Create an in-memory SQLite database for tests
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def setup_test_db():
    """Create tables before each test and drop after."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    """Create a test client with overridden DB dependency."""
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def seeded_user():
    """Seed a user into the test DB and return it."""
    db = TestSessionLocal()
    user = User(
        email="test@example.com",
        hashed_password=get_password_hash("Test@pass1"),
        first_name="Test",
        last_name="User",
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def test_login_success(client, seeded_user):
    """Test successful login with valid credentials."""
    response = client.post("/api/v1/auth/login", data={
        "username": "test@example.com",
        "password": "Test@pass1",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "test@example.com"


def test_login_invalid_credentials(client, seeded_user):
    """Test login with invalid credentials."""
    response = client.post("/api/v1/auth/login", data={
        "username": "test@example.com",
        "password": "wrongpassword",
    })
    assert response.status_code == 401
    assert "detail" in response.json()


def test_register_success(client):
    """Test successful user registration."""
    response = client.post("/api/v1/auth/register", json={
        "email": "newuser@example.com",
        "password": "New@pass456",
        "first_name": "New",
        "last_name": "User",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "newuser@example.com"


def test_register_existing_user(client, seeded_user):
    """Test registration with existing email."""
    response = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "Another@1pass",
        "first_name": "Test",
        "last_name": "User",
    })
    assert response.status_code == 400
    assert "detail" in response.json()


@pytest.fixture
def verified_user_token(client):
    reg = client.post("/api/v1/auth/register", json={
        "email": "me@example.com",
        "password": "Me@pass123",
        "first_name": "Alice",
        "last_name": "Smith",
    })
    assert reg.status_code == 200, f"Registration failed: {reg.text}"
    token = reg.json()["access_token"]
    db = TestSessionLocal()
    try:
        user = db.query(User).filter(User.email == "me@example.com").first()
        assert user is not None
        user.is_verified = True
        db.commit()
    finally:
        db.close()
    return token


def test_get_me_returns_user(client, verified_user_token):
    resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {verified_user_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "me@example.com"
    assert data["first_name"] == "Alice"
    assert data["last_name"] == "Smith"


def test_get_me_unauthorized(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


def test_resend_verification_sends_new_token(client):
    reg = client.post("/api/v1/auth/register", json={
        "email": "resend@example.com",
        "password": "Resend@1pass",
    })
    assert reg.status_code == 200, f"Registration failed: {reg.text}"
    token = reg.json()["access_token"]

    resp = client.post(
        "/api/v1/auth/resend-verification",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Verification email sent"

    db = TestSessionLocal()
    try:
        user = db.query(User).filter(User.email == "resend@example.com").first()
        assert user is not None
        assert user.verification_token is not None
    finally:
        db.close()


def test_resend_verification_already_verified(client, verified_user_token):
    resp = client.post(
        "/api/v1/auth/resend-verification",
        headers={"Authorization": f"Bearer {verified_user_token}"},
    )
    assert resp.status_code == 400
    assert "already verified" in resp.json()["detail"]


def test_patch_profile_updates_name(client, verified_user_token):
    resp = client.patch(
        "/api/v1/auth/profile",
        json={"first_name": "Bob", "last_name": "Jones"},
        headers={"Authorization": f"Bearer {verified_user_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["first_name"] == "Bob"
    assert data["last_name"] == "Jones"
    assert data["email"] == "me@example.com"


def test_patch_profile_partial_update(client, verified_user_token):
    resp = client.patch(
        "/api/v1/auth/profile",
        json={"first_name": "Charlie"},
        headers={"Authorization": f"Bearer {verified_user_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["first_name"] == "Charlie"
    assert data["last_name"] == "Smith"


def test_patch_profile_unauthorized(client):
    resp = client.patch("/api/v1/auth/profile", json={"first_name": "X"})
    assert resp.status_code == 401


def test_delete_account_wrong_password(client, verified_user_token):
    resp = client.request(
        "DELETE",
        "/api/v1/auth/account",
        json={"password": "WrongPassword!1"},
        headers={"Authorization": f"Bearer {verified_user_token}"},
    )
    assert resp.status_code == 400
    assert "incorrect" in resp.json()["detail"].lower()


def test_delete_account_success(client, verified_user_token):
    resp = client.request(
        "DELETE",
        "/api/v1/auth/account",
        json={"password": "Me@pass123"},
        headers={"Authorization": f"Bearer {verified_user_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Account deleted"

    login = client.post("/api/v1/auth/login", data={
        "username": "me@example.com",
        "password": "Me@pass123",
    })
    assert login.status_code == 401


def test_delete_account_unauthorized(client):
    resp = client.request("DELETE", "/api/v1/auth/account", json={"password": "anything"})
    assert resp.status_code == 401
