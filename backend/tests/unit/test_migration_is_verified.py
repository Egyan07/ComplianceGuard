"""Reproduction + regression for the is_verified migration failing on a
populated database.

Migration 99f5c91a02f7 adds users.is_verified as NOT NULL with no server_default.
On an empty DB (how the test suite normally runs migrations) it succeeds, hiding
the bug. On a DB that already has user rows — i.e. every existing deployment —
adding a NOT NULL column with no default fails (Postgres: "contains null
values"; SQLite: "Cannot add a NOT NULL column with default value NULL").

This test upgrades to the revision just before is_verified, inserts a user row,
then upgrades through it — which fails without server_default and succeeds with.
"""
import os
import pytest
from alembic import command
from alembic.config import Config as AlembicConfig

from app.core.database import alembic_config_url, create_database_engine

ALEMBIC_INI = os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini")
BEFORE_IS_VERIFIED = "1a721f30b3f7"  # down_revision of 99f5c91a02f7


def test_percent_escaped_url_survives_alembic_config():
    """SQLAlchemy 2.1 encodes the in-memory URL; ConfigParser treats % as syntax.

    Regression for the suite-wide ValueError: without the escaping, setting
    ``sqlite:///%3Amemory%3A`` raises before a single test can run.
    """
    cfg = AlembicConfig()

    cfg.set_main_option("sqlalchemy.url", alembic_config_url("sqlite:///%3Amemory%3A"))

    assert cfg.get_main_option("sqlalchemy.url") == "sqlite:///%3Amemory%3A"


@pytest.mark.skipif(not os.path.exists(ALEMBIC_INI), reason="alembic.ini not found")
def test_is_verified_migration_on_populated_db():
    engine = create_database_engine(testing=True)
    cfg = AlembicConfig(ALEMBIC_INI)
    cfg.set_main_option("sqlalchemy.url", alembic_config_url(engine.url))

    with engine.connect() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, BEFORE_IS_VERIFIED)

        # Populate one user row (mimics an existing deployment). Insert into
        # every NOT NULL column that lacks a default, with a dummy value
        # (SQLite is dynamically typed, so 'x' is accepted everywhere).
        cols = conn.exec_driver_sql("PRAGMA table_info('users')").fetchall()
        required = [c[1] for c in cols if c[3] == 1 and c[4] is None and c[5] == 0]
        col_list = ", ".join(required)
        val_list = ", ".join(["'x'"] * len(required))
        conn.exec_driver_sql(f"INSERT INTO users ({col_list}) VALUES ({val_list})")

        # Upgrade through 99f5c91a02f7. Fails pre-fix (NOT NULL, no default).
        command.upgrade(cfg, "head")

        # The existing row must have received the default.
        verified = conn.exec_driver_sql("SELECT is_verified FROM users").fetchone()[0]
        assert verified in (0, False)
