import json, pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.core.database import Base, get_db, create_test_database
from app.models.user import User
from app.models.enterprise import UserRole
from app.core.auth import get_password_hash, create_access_token

_engine = None
_Session = None


@pytest.fixture(autouse=True)
def setup_db():
    global _engine, _Session
    _engine = create_test_database()
    _Session = sessionmaker(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


def override_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = override_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def _seed_enterprise():
    db = _Session()
    user = User(email="ent@x.com", hashed_password=get_password_hash("p"), is_active=True, is_verified=True, license_tier="enterprise")
    db.add(user); db.commit(); db.refresh(user)
    db.add(UserRole(user_id=user.id, role="admin")); db.commit()
    email = user.email
    db.close()
    return create_access_token({"sub": email})


def test_export_requires_enterprise(client):
    db = _Session()
    user = User(email="pro@x.com", hashed_password=get_password_hash("p"), is_active=True, is_verified=True, license_tier="pro")
    db.add(user); db.commit(); db.refresh(user)
    token = create_access_token({"sub": user.email})
    db.close()
    r = client.get("/api/v1/enterprise/export", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_export_returns_ndjson_content_type(client):
    token = _seed_enterprise()
    r = client.get("/api/v1/enterprise/export", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert "ndjson" in r.headers.get("content-type", "")


def test_export_contains_section_headers(client):
    token = _seed_enterprise()
    r = client.get("/api/v1/enterprise/export", headers={"Authorization": f"Bearer {token}"})
    lines = [json.loads(l) for l in r.text.strip().splitlines() if l]
    types = {l.get("type") for l in lines}
    assert "section" in types


def test_export_generates_audit_event(client):
    token = _seed_enterprise()
    client.get("/api/v1/enterprise/export", headers={"Authorization": f"Bearer {token}"})
    from app.models.enterprise import AuditLog
    db = _Session()
    row = db.query(AuditLog).filter(AuditLog.event_type == "export_generated").first()
    db.close()
    assert row is not None
