"""Regression for the audit append race: a non-null prev_hash is unique, so two
concurrent appends can't fork the chain by both claiming the same predecessor.
"""
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, create_test_database
from app.models.enterprise import AuditLog
from app.services.audit_service import log_event
from app.api.enterprise.audit import verify_audit_chain


@pytest.fixture
def db():
    engine = create_test_database()
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


def test_duplicate_non_null_prev_hash_is_rejected(db):
    db.add(AuditLog(event_type="evaluation_run", entry_hash="h1", prev_hash="PREDECESSOR"))
    db.commit()
    db.add(AuditLog(event_type="evaluation_run", entry_hash="h2", prev_hash="PREDECESSOR"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_multiple_null_prev_hash_allowed(db):
    # NULLs are distinct under the unique constraint (genesis exemption).
    db.add(AuditLog(event_type="a", entry_hash="g1", prev_hash=None))
    db.add(AuditLog(event_type="b", entry_hash="g2", prev_hash=None))
    db.commit()  # must not raise
    assert db.query(AuditLog).count() == 2


def test_sequential_log_events_form_a_valid_chain(db):
    log_event(db, "evaluation_run", score=0.9)
    log_event(db, "export_generated", score=0.5)
    log_event(db, "role_assigned", score=0.7)
    assert db.query(AuditLog).count() == 3
    assert verify_audit_chain(current_user=None, db=db)["valid"] is True
