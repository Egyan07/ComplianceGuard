"""Regression: NDJSON export must not leak host paths or cross-tenant/system
audit rows."""
import json

import pytest
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, create_test_database
from app.core.auth import get_password_hash
from app.models.user import User
from app.models.evidence import EvidenceCollection, EvidenceItem
from app.models.enterprise import AuditLog
from app.api.enterprise.export import _stream_export


@pytest.fixture
def db():
    engine = create_test_database()
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


def test_export_strips_storage_path_and_scopes_audit_rows(db):
    user = User(email="ent@x.com", hashed_password=get_password_hash("p"),
                is_active=True, is_verified=True, license_tier="enterprise")
    db.add(user)
    db.commit()
    db.refresh(user)

    coll = EvidenceCollection(collection_id="c1", user_id=user.id, status="success")
    db.add(coll)
    db.commit()
    db.refresh(coll)
    db.add(EvidenceItem(
        collection_id=coll.id, evidence_type="manual", source="manual", status="compliant",
        data={"storage_path": "/home/appuser/Evidence/secret.pdf", "note": "keep"},
    ))
    db.add(AuditLog(event_type="evaluation_run", entry_hash="h1", prev_hash=None, user_id=user.id))
    db.add(AuditLog(event_type="system_event", entry_hash="h2", prev_hash="h1", user_id=None))
    db.commit()

    lines = [json.loads(ln) for ln in _stream_export(db, user) if ln.strip()]

    items = [ln for ln in lines if ln.get("type") == "evidence_item"]
    assert items
    for it in items:
        assert "storage_path" not in (it.get("data") or {})   # host path stripped
        assert (it.get("data") or {}).get("note") == "keep"    # other data preserved

    audit = [ln for ln in lines if ln.get("type") == "audit_log"]
    assert len(audit) == 1                                     # only the user's own row
    assert audit[0]["user_id"] == user.id
