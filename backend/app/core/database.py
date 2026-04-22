"""
Database configuration and setup for ComplianceGuard.

This module provides SQLAlchemy database configuration, session management,
and base model class for all database models.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool
from typing import Generator

from app.core.config import get_database_url, settings


# Database URL configuration
def get_database_url_for_environment(testing: bool = False) -> str:
    """Get database URL based on environment and testing flag."""
    return get_database_url(testing=testing)


def create_database_engine(testing: bool = False):
    """Create SQLAlchemy engine with appropriate configuration."""
    url = get_database_url_for_environment(testing=testing)

    if "sqlite" in url:
        if testing or ":memory:" in url:
            return create_engine(
                "sqlite:///:memory:",
                connect_args={"check_same_thread": False},
                poolclass=StaticPool,
                echo=settings.database_echo
            )
        else:
            return create_engine(
                url,
                connect_args={"check_same_thread": False},
                echo=settings.database_echo
            )
    else:
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
    """Dependency function to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_test_db() -> Generator:
    """Get database session for testing."""
    test_engine = create_database_engine(testing=True)
    Base.metadata.create_all(bind=test_engine)

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
        Base.metadata.drop_all(bind=test_engine)


def init_database():
    """Initialize the database by creating all tables."""
    Base.metadata.create_all(bind=engine)


def get_session_factory():
    """Get a session factory for creating database sessions."""
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def create_test_database():
    """
    Create a test database with the real schema by running Alembic migrations.

    We deliberately avoid ``Base.metadata.create_all`` so CHECK constraints,
    server defaults, and new indexes ship the same way tests see them —
    migrations. If migrations ever break, the test suite fails loudly
    instead of silently drifting.

    Falls back to ``create_all`` only when ``alembic.ini`` is missing (ad-hoc
    scripts running the module outside the repo tree).
    """
    import os

    test_engine = create_database_engine(testing=True)

    alembic_ini = os.path.join(
        os.path.dirname(__file__), "..", "..", "alembic.ini"
    )
    if not os.path.exists(alembic_ini):
        Base.metadata.create_all(bind=test_engine)
        return test_engine

    from alembic import command as alembic_command
    from alembic.config import Config as AlembicConfig

    alembic_cfg = AlembicConfig(alembic_ini)
    alembic_cfg.set_main_option("sqlalchemy.url", str(test_engine.url))
    # Pin the same engine's connection so the migrations operate on the
    # in-memory DB pytest is using, not a fresh file-backed one.
    with test_engine.connect() as connection:
        alembic_cfg.attributes["connection"] = connection
        alembic_command.upgrade(alembic_cfg, "head")
    return test_engine


def close_database():
    """Close database connections."""
    engine.dispose()
