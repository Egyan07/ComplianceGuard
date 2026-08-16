"""Regression: the Postgres engine must be created with explicit pool sizing.

Without it, SQLAlchemy's defaults (pool_size=5, max_overflow=10 = 15/worker ×
4 workers = 60 connections, no recycle) exhaust a managed Postgres connection
cap. We spy on create_engine so the test needs no Postgres driver.
"""
import app.core.database as db


# Documented defaults from app/core/config.py. The test pins them explicitly
# (monkeypatched onto the settings singleton) so it is deterministic even on
# machines whose environment overrides DB_POOL_* — production behavior is
# untouched; the test only freezes the inputs it asserts on.
_POOL_DEFAULTS = {
    "db_pool_size": 5,
    "db_max_overflow": 5,
    "db_pool_timeout": 30,
    "db_pool_recycle": 1800,
}


def test_postgres_engine_has_pool_sizing(monkeypatch):
    captured = {}

    def fake_create_engine(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(db, "create_engine", fake_create_engine)
    monkeypatch.setattr(
        db, "get_database_url_for_environment",
        lambda testing=False: "postgresql+psycopg2://u:p@h:5432/db",
    )
    for key, value in _POOL_DEFAULTS.items():
        monkeypatch.setattr(db.settings, key, value)

    db.create_database_engine(testing=False)

    assert captured.get("pool_pre_ping") is True
    assert captured.get("pool_size") == 5
    assert captured.get("max_overflow") == 5
    assert captured.get("pool_timeout") == 30
    assert captured.get("pool_recycle") == 1800
