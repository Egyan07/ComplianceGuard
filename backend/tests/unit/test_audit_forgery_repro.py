"""
Regression for the (formerly CRITICAL) audit-chain forgeability finding.

The audit chain is now HMAC-keyed (audit_service.compute_entry_hash) with a
secret derived from SECRET_KEY (env, never in the DB). An attacker with DB write
access but not the secret cannot recompute valid entry hashes — so tampering and
re-chaining with the public, unkeyed SHA-256 (the best they can do) is DETECTED
by verify_audit_chain.

Before the fix this test xfailed (the unkeyed chain was re-chainable by anyone).
It now passes: the forgery is detected.
"""
import hashlib

import pytest
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, create_test_database
from app.models.enterprise import AuditLog
from app.services.audit_service import canonical_json, canonical_timestamp, log_event
from app.api.enterprise.audit import verify_audit_chain


@pytest.fixture
def db():
    engine = create_test_database()
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


def _attacker_unkeyed_hash(prev_hash, row):
    """What a DB-write attacker WITHOUT the secret can compute: a plain,
    unkeyed SHA-256 over the same canonical payload."""
    payload = canonical_json({
        "prev_hash": prev_hash,
        "event_type": row.event_type,
        "user_id": row.user_id,
        "framework": row.framework,
        "score": row.score,
        "detail": row.detail_json or {},
        "created_at": canonical_timestamp(row.created_at),
    }).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def test_audit_chain_detects_forgery(db):
    # 1. Build a legitimate (HMAC-keyed) chain.
    log_event(db, "evaluation_run", user_id=1, framework="soc2", score=0.90, detail={"n": 1})
    log_event(db, "export_generated", user_id=1, framework="soc2", score=0.50, detail={"n": 2})
    log_event(db, "role_assigned", user_id=1, framework="soc2", score=0.70, detail={"n": 3})
    assert verify_audit_chain(current_user=None, db=db)["valid"] is True

    # 2. Attacker tampers entry #2 and re-chains with the unkeyed public hash
    #    (no secret available).
    rows = db.query(AuditLog).order_by(AuditLog.id.asc()).all()
    rows[1].score = 1.0
    rows[1].detail_json = {"n": 2, "tampered": True}
    prev = rows[0].entry_hash
    for r in rows[1:]:
        r.prev_hash = prev
        r.entry_hash = _attacker_unkeyed_hash(prev, r)
        prev = r.entry_hash
    db.commit()

    # 3. HMAC verify detects the forgery — the unkeyed hashes don't match.
    result = verify_audit_chain(current_user=None, db=db)
    assert result["valid"] is False
