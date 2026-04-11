"""
Test module for User model.

This module contains tests for the User model to verify database operations
and authentication functionality.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone

from app.models.user import User
from app.models.company import Company
from app.models import ComplianceFramework
from app.core.database import Base


@pytest.fixture
def test_db():
    """Create a test database session."""
    # Use in-memory SQLite for testing
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        echo=False
    )

    # Create all tables
    Base.metadata.create_all(bind=engine)

    # Create session
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine
    )

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # Drop all tables
        Base.metadata.drop_all(bind=engine)


def test_create_user(test_db):
    """Test creating a new user in the database."""
    # This test should fail initially since User model doesn't exist yet
    user = User(
        email="test@example.com",
        hashed_password="hashed_password_123",
        first_name="Test",
        last_name="User",
        is_active=True,
        is_superuser=False
    )

    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    # Verify user was created
    assert user.id is not None
    assert user.email == "test@example.com"
    assert user.first_name == "Test"
    assert user.last_name == "User"
    assert user.is_active is True
    assert user.is_superuser is False
    assert isinstance(user.created_at, datetime)
    assert isinstance(user.updated_at, datetime)


def test_user_relationships(test_db):
    """Test user relationships with company."""
    # Create a company first
    company = Company(
        name="Test Corp",
        domain="testcorp.com"
    )
    test_db.add(company)
    test_db.commit()
    test_db.refresh(company)

    # Create user with company relationship
    user = User(
        email="admin@testcorp.com",
        hashed_password="hashed_password_123",
        first_name="Admin",
        last_name="User",
        company_id=company.id
    )

    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    # Verify relationships
    assert user.company_id == company.id
    assert user.company == company
    assert user in company.users


def test_user_unique_email_constraint(test_db):
    """Test that email must be unique."""
    # Create first user
    user1 = User(
        email="unique@example.com",
        hashed_password="hashed_password_123"
    )
    test_db.add(user1)
    test_db.commit()

    # Try to create second user with same email
    user2 = User(
        email="unique@example.com",
        hashed_password="another_hashed_password"
    )
    test_db.add(user2)

    # This should raise an integrity error
    with pytest.raises(Exception):
        test_db.commit()