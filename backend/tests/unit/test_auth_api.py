"""
Tests for authentication API endpoints.

This module contains tests for login and registration API endpoints
using JWT-based authentication.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
from sqlalchemy.orm import Session

from app.main import app
from app.models.user import User
from app.core.auth import get_password_hash


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def mock_db():
    """Create a mock database session."""
    db = Mock(spec=Session)

    # Mock the query chain for User lookup
    mock_query = Mock()
    mock_filter = Mock()
    mock_first = Mock()

    db.query.return_value = mock_query
    mock_query.filter.return_value = mock_filter
    mock_filter.first.return_value = mock_first

    return db


@pytest.fixture
def test_user():
    """Create a test user in the database."""
    # Pre-hashed password for "123" using bcrypt
    hashed_pwd = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RX.jxPYjG"
    user = User(
        id=1,
        email="test@example.com",
        hashed_password=hashed_pwd,
        first_name="Test",
        last_name="User",
        is_active=True,
        is_superuser=False
    )
    return user


def test_login_success(client, mock_db, test_user):
    """Test successful login with valid credentials."""
    # Mock both the get_db dependency and the authenticate_user function
    with patch('app.api.auth.get_db') as mock_get_db:
        with patch('app.api.auth.authenticate_user') as mock_auth:
            # Set up the mocks
            mock_get_db.return_value = mock_db
            mock_auth.return_value = test_user

            response = client.post("/api/auth/login", data={
                "username": "test@example.com",
                "password": "123"
            })

    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_credentials(client, mock_db):
    """Test login with invalid credentials."""
    with patch('app.api.auth.get_db') as mock_get_db:
        with patch('app.api.auth.authenticate_user') as mock_auth:
            mock_get_db.return_value = mock_db
            mock_auth.return_value = None  # Authentication fails

            response = client.post("/api/auth/login", data={
                "username": "wrong@example.com",
                "password": "wrongpassword"
            })

    assert response.status_code == 401
    data = response.json()
    assert "detail" in data


def test_register_success(client, mock_db, test_user):
    """Test successful user registration."""
    # Mock the user not existing for email check and create a new user
    with patch('app.api.auth.get_db') as mock_get_db:
        with patch('app.core.auth.get_password_hash') as mock_hash:
            mock_get_db.return_value = mock_db
            mock_hash.return_value = "hashed_password_123"

            # Mock the database operations
            mock_db.query.return_value.filter.return_value.first.return_value = None
            mock_db.add = Mock()
            mock_db.commit = Mock()
            mock_db.refresh = Mock(side_effect=lambda x: setattr(x, 'id', 2))  # Simulate setting ID

            # Use test_user as the newly created user
            test_user.email = "newuser@example.com"
            test_user.id = 2

            response = client.post("/api/auth/register", json={
                "email": "newuser@example.com",
                "password": "456",
                "first_name": "New",
                "last_name": "User"
            })

    print(f"Register Status: {response.status_code}")
    print(f"Register Response: {response.text}")
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "newuser@example.com"


def test_register_existing_user(client, mock_db, test_user):
    """Test registration with existing email."""
    with patch('app.api.auth.get_db') as mock_get_db:
        mock_get_db.return_value = mock_db

        # Mock user already exists
        mock_db.query.return_value.filter.return_value.first.return_value = test_user

        response = client.post("/api/auth/register", json={
            "email": "test@example.com",  # Existing email
            "password": "789",
            "first_name": "Test",
            "last_name": "User"
        })

    assert response.status_code == 400
    data = response.json()
    assert "detail" in data