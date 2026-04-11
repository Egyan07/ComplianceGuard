"""
Database configuration and setup for ComplianceGuard.

This module provides SQLAlchemy database configuration, session management,
and base model class for all database models.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from typing import Generator, Optional

from app.core.config import get_database_url, settings


# Database URL configuration
# Use centralized configuration management
def get_database_url_for_environment(testing: bool = False) -> str:
    """Get database URL based on environment and testing flag."""
    return get_database_url(testing=testing)


# Create SQLAlchemy engine
def create_database_engine(testing: bool = False):
    """Create SQLAlchemy engine with appropriate configuration."""
    url = get_database_url_for_environment(testing=testing)

    if "sqlite" in url:
        if testing or ":memory:" in url:
            # Use in-memory SQLite for testing
            return create_engine(
                "sqlite:///:memory:",
                connect_args={"check_same_thread": False},
                poolclass=StaticPool,
                echo=settings.database_echo
            )
        else:
            # Use file-based SQLite for development
            return create_engine(
                url,
                connect_args={"check_same_thread": False},
                echo=settings.database_echo
            )
    else:
        # PostgreSQL or other databases
        return create_engine(
            url,
            echo=settings.database_echo,
            pool_pre_ping=True
        )


# Create engine instance
engine = create_database_engine(testing=False)


# Create session maker
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# Create base class for models
Base = declarative_base()


def get_db() -> Generator:
    """Dependency function to get database session.

    This function is used by FastAPI dependency injection to provide
    database sessions to route handlers.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_test_db() -> Generator:
    """Get database session for testing.

    Creates an in-memory SQLite database for testing purposes.
    """
    # Create test engine
    test_engine = create_database_engine(testing=True)

    # Create all tables
    Base.metadata.create_all(bind=test_engine)

    # Create session
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine
    )

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # Drop all tables
        Base.metadata.drop_all(bind=test_engine)


def init_database():
    """Initialize the database by creating all tables."""
    Base.metadata.create_all(bind=engine)


def get_session_factory():
    """Get a session factory for creating database sessions."""
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def create_test_database():
    """
    Create a test database with all tables.

    Returns:
        Engine: The test database engine
    """
    test_engine = create_database_engine(testing=True)
    Base.metadata.create_all(bind=test_engine)
    return test_engine


def close_database():
    """Close database connections."""
    engine.dispose()