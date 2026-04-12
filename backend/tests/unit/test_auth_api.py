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
        hashed_password=get_password_hash("testpass123"),
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
    response = client.post("/api/auth/login", data={
        "username": "test@example.com",
        "password": "testpass123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "test@example.com"


def test_login_invalid_credentials(client, seeded_user):
    """Test login with invalid credentials."""
    response = client.post("/api/auth/login", data={
        "username": "test@example.com",
        "password": "wrongpassword",
    })
    assert response.status_code == 401
    assert "detail" in response.json()


def test_register_success(client):
    """Test successful user registration."""
    response = client.post("/api/auth/register", json={
        "email": "newuser@example.com",
        "password": "newpass456",
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
    response = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "anotherpass",
        "first_name": "Test",
        "last_name": "User",
    })
    assert response.status_code == 400
    assert "detail" in response.json()
