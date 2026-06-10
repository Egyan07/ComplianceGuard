"""
Reproduction of the CRITICAL audit-chain forgeability finding.

The audit "hash chain" (audit_service.compute_entry_hash) is plain, UNKEYED
SHA-256. verify_audit_chain recomputes hashes with the same public algorithm.
So an attacker with DB write access can tamper a row, re-chain every subsequent
row with the same public function, and the chain still validates — there is no
cryptographic tamper-evidence.

This test asserts the DESIRED behavior (tampering is detected). It currently
FAILS (the forgery is NOT detected), which is the reproduction. It is marked
xfail(strict=True) so CI stays green now and AUTOMATICALLY fails — telling us to
remove the marker — once the Phase 3 fix (HMAC/signature with an out-of-DB
secret) makes forgery detectable.

Prove the failure at runtime with:  pytest --runxfail tests/unit/test_audit_forgery_repro.py
"""

import pytest
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, create_test_database
from app.models.enterprise import AuditLog
from app.services.audit_service import compute_entry_hash, log_event, canonical_timestamp
from app.api.enterprise.audit import verify_audit_chain


@pytest.fixture
def db():
    engine = create_test_database()
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.mark.xfail(
    reason="Audit chain is unkeyed SHA-256 and is forgeable; fixed by HMAC/signature in Phase 3",
    strict=True,
)
def test_audit_chain_detects_forgery(db):
    # 1. Build a legitimate chain.
    log_event(db, "evaluation_run", user_id=1, framework="soc2", score=0.90, detail={"n": 1})
    log_event(db, "export_generated", user_id=1, framework="soc2", score=0.50, detail={"n": 2})
    log_event(db, "role_assigned", user_id=1, framework="soc2", score=0.70, detail={"n": 3})
    assert verify_audit_chain(current_user=None, db=db)["valid"] is True

    # 2. Attacker tampers entry #2 (hides a damning low score) and RE-CHAINS the
    #    rest using the SAME public hash function verify uses — no secret needed.
    rows = db.query(AuditLog).order_by(AuditLog.id.asc()).all()
    rows[1].score = 1.0
    rows[1].detail_json = {"n": 2, "tampered": True}
    prev = rows[0].entry_hash
    for r in rows[1:]:
        r.prev_hash = prev
        r.entry_hash = compute_entry_hash(
            prev, r.event_type, r.user_id, r.framework, r.score,
            r.detail_json or {}, canonical_timestamp(r.created_at),
        )
        prev = r.entry_hash
    db.commit()

    # 3. DESIRED: a tamper-evident chain must now report invalid.
    #    CURRENT (vulnerable): it still reports valid -> this assertion fails -> xfail.
    result = verify_audit_chain(current_user=None, db=db)
    assert result["valid"] is False, (
        "Audit chain validated despite forged content — the hash chain provides "
        "NO tamper-evidence (unkeyed SHA-256, re-chainable by anyone)."
    )
