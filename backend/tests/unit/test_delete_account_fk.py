"""Reproduction + regression for the delete_account FK violation.

delete_account bulk-deleted evidence_collections without first removing child
evidence_items. On Postgres (FKs enforced) that raises ForeignKeyViolation, so
deleting an account with any evidence is impossible (GDPR erasure broken). The
SQLite test engine here enables PRAGMA foreign_keys=ON to mimic Postgres.
"""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import Base, get_db
from app.core.auth import get_password_hash
from app.models.user import User
from app.models.evidence import EvidenceCollection, EvidenceItem

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)


@event.listens_for(engine, "connect")
def _fk_pragma(dbapi_con, _rec):
    dbapi_con.execute("PRAGMA foreign_keys=ON")


TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _override_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = _override_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


def test_delete_account_with_evidence_succeeds():
    s = TestSession()
    user = User(
        email="del@test.com", hashed_password=get_password_hash("Pass@1234"),
        first_name="D", last_name="L", is_active=True, is_verified=True,
    )
    s.add(user)
    s.commit()
    s.refresh(user)
    coll = EvidenceCollection(collection_id="c1", user_id=user.id, status="success")
    s.add(coll)
    s.commit()
    s.refresh(coll)
    s.add(EvidenceItem(collection_id=coll.id, evidence_type="manual", source="manual", status="compliant"))
    s.commit()
    s.close()

    client = TestClient(app)
    login = client.post("/api/v1/auth/login", data={"username": "del@test.com", "password": "Pass@1234"})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]

    res = client.request(
        "DELETE", "/api/v1/auth/account",
        json={"password": "Pass@1234"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.text

    check = TestSession()
    try:
        assert check.query(User).filter(User.email == "del@test.com").first() is None
        assert check.query(EvidenceItem).count() == 0
        assert check.query(EvidenceCollection).count() == 0
    finally:
        check.close()
