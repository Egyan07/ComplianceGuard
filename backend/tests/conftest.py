"""
Pytest configuration for ComplianceGuard tests.

This module provides shared fixtures and configuration for all tests.
"""

import pytest
import os
from typing import Generator

from sqlalchemy.orm import Session

# Set testing environment before any imports
os.environ["ENVIRONMENT"] = "testing"
os.environ["DATABASE_TYPE"] = "sqlite"

from app.core.config import settings
from app.core.database import Base, create_test_database
from sqlalchemy.orm import sessionmaker
from app.models.user import User
from app.core.auth import get_password_hash


def pytest_configure(config):
    """Configure pytest with custom settings."""
    # Ensure we're in testing mode
    os.environ.setdefault("ENVIRONMENT", "testing")
    os.environ.setdefault("DATABASE_TYPE", "sqlite")
    os.environ.setdefault("TEST_DATABASE_URL", "sqlite:///:memory:")


@pytest.fixture(scope="session")
def test_engine():
    """Create a test database engine for the entire test session."""
    from app.core.database import create_test_database

    # Create test database
    test_engine = create_test_database()

    yield test_engine

    # Cleanup after all tests
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def test_db_session(test_engine) -> Generator[Session, None, None]:
    """Create a fresh database session for each test."""
    # Create session factory
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine
    )

    # Create session
    db = TestingSessionLocal()

    try:
        yield db
    finally:
        # Rollback any transactions
        db.rollback()
        db.close()


@pytest.fixture(scope="function")
def test_user(test_db_session: Session) -> User:
    """Create a test user for authentication tests."""
    user_data = {
        "email": "test@example.com",
        "password": "testpassword123",
        "first_name": "Test",
        "last_name": "User"
    }

    hashed_password = get_password_hash(user_data["password"])
    user = User(
        email=user_data["email"],
        hashed_password=hashed_password,
        first_name=user_data["first_name"],
        last_name=user_data["last_name"],
        is_active=True,
        is_superuser=False
    )

    test_db_session.add(user)
    test_db_session.commit()
    test_db_session.refresh(user)

    yield user

    # Cleanup after test
    try:
        test_db_session.delete(user)
        test_db_session.commit()
    except:
        test_db_session.rollback()


@pytest.fixture(scope="function")
def superuser(test_db_session: Session) -> User:
    """Create a superuser for admin tests."""
    user_data = {
        "email": "admin@example.com",
        "password": "adminpassword123",
        "first_name": "Admin",
        "last_name": "User"
    }

    hashed_password = get_password_hash(user_data["password"])
    user = User(
        email=user_data["email"],
        hashed_password=hashed_password,
        first_name=user_data["first_name"],
        last_name=user_data["last_name"],
        is_active=True,
        is_superuser=True
    )

    test_db_session.add(user)
    test_db_session.commit()
    test_db_session.refresh(user)

    yield user

    # Cleanup after test
    try:
        test_db_session.delete(user)
        test_db_session.commit()
    except:
        test_db_session.rollback()


@pytest.fixture(scope="function")
def test_settings():
    """Get test settings."""
    from app.core.config import get_settings
    return get_settings()


def pytest_collection_modifyitems(config, items):
    """Modify test collection to add markers and categories."""
    for item in items:
        # Add markers based on test path
        if "e2e" in item.nodeid:
            item.add_marker(pytest.mark.e2e)
        elif "integration" in item.nodeid:
            item.add_marker(pytest.mark.integration)
        elif "unit" in item.nodeid:
            item.add_marker(pytest.mark.unit)


# Configure test database isolation
@pytest.fixture(autouse=True)
def enable_db_access_for_all_tests(test_db_session):
    """Enable database access for all tests."""
    pass


# Mock external services for testing
@pytest.fixture(autouse=True)
def mock_aws_services():
    """Mock AWS services to prevent external calls during tests."""
    # Mocking is handled by test-specific implementations when needed
    pass


@pytest.fixture(autouse=True)
def mock_external_http_calls():
    """Mock external HTTP calls during tests."""
    # Mocking is handled by test-specific implementations when needed
    pass


# Custom test markers

def pytest_addoption(parser):
    """Add custom command line options for pytest."""
    parser.addoption(
        "--run-e2e",
        action="store_true",
        default=False,
        help="Run end-to-end tests"
    )
    parser.addoption(
        "--run-slow",
        action="store_true",
        default=False,
        help="Run slow tests"
    )


def pytest_configure(config):
    """Configure custom markers."""
    config.addinivalue_line(
        "markers", "e2e: mark test as end-to-end test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running test"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "unit: mark test as unit test"
    )


def pytest_collection_modifyitems(config, items):
    """Skip tests based on command line options."""
    skip_e2e = pytest.mark.skip(reason="need --run-e2e option to run")
    skip_slow = pytest.mark.skip(reason="need --run-slow option to run")

    for item in items:
        if "e2e" in item.keywords and not config.getoption("--run-e2e"):
            item.add_marker(skip_e2e)
        if "slow" in item.keywords and not config.getoption("--run-slow"):
            item.add_marker(skip_slow)