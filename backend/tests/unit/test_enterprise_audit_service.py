import os
import pytest
from app.services.audit_service import canonical_json, compute_entry_hash, log_event
from app.models.enterprise import AuditLog
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, create_test_database

_engine = None
_Session = None


@pytest.fixture(autouse=True)
def db():
    global _engine, _Session
    _engine = create_test_database()
    _Session = sessionmaker(bind=_engine)
    session = _Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=_engine)


def test_canonical_json_sorts_keys():
    result = canonical_json({"z": 1, "a": 2})
    assert result == '{"a":2,"z":1}'


def test_canonical_json_deterministic():
    assert canonical_json({"b": 1, "a": 2}) == canonical_json({"a": 2, "b": 1})


def test_compute_entry_hash_returns_64_chars():
    h = compute_entry_hash(None, "evaluation_run", None, "soc2", 0.9, {}, "2026-05-17T00:00:00+00:00")
    assert len(h) == 64


def test_compute_entry_hash_changes_when_score_changes():
    h1 = compute_entry_hash(None, "evaluation_run", None, "soc2", 0.9, {}, "2026-05-17T00:00:00+00:00")
    h2 = compute_entry_hash(None, "evaluation_run", None, "soc2", 0.5, {}, "2026-05-17T00:00:00+00:00")
    assert h1 != h2


def test_log_event_inserts_row(db):
    log_event(db, "evaluation_run", user_id=None, framework="soc2", score=0.8, detail={"controls": 29})
    rows = db.query(AuditLog).all()
    assert len(rows) == 1
    assert rows[0].event_type == "evaluation_run"
    assert rows[0].entry_hash is not None


def test_log_event_hash_chain_links(db):
    log_event(db, "evaluation_run", user_id=None, framework="soc2", score=0.8, detail={})
    log_event(db, "evidence_collected", user_id=None, framework="soc2", score=None, detail={})
    rows = db.query(AuditLog).order_by(AuditLog.id).all()
    assert rows[1].prev_hash == rows[0].entry_hash


def test_log_event_first_row_has_null_prev_hash(db):
    log_event(db, "evaluation_run", user_id=None, framework="soc2", score=0.8, detail={})
    row = db.query(AuditLog).first()
    assert row.prev_hash is None
