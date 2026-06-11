import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.core.database import Base, get_db, create_test_database
from app.models.user import User
from app.models.enterprise import AuditLog, UserRole
from app.core.auth import get_password_hash, create_access_token
from app.core.config import settings


@pytest.fixture(autouse=True)
def _enterprise_mode_on(monkeypatch):
    # Enterprise endpoints are only served on a dedicated Enterprise deployment.
    monkeypatch.setattr(settings, "enterprise_mode", True)


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


@pytest.fixture
def enterprise_user():
    db = _Session()
    user = User(
        email="ent@example.com",
        hashed_password=get_password_hash("pass"),
        is_active=True, is_verified=True,
        license_tier="enterprise",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    user_id = user.id
    role = UserRole(user_id=user_id, role="admin")
    db.add(role)
    db.commit()
    db.close()
    # Return a plain namespace so fixtures can access .email without a session
    class _U:
        id = user_id
        email = "ent@example.com"
    return _U()


@pytest.fixture
def pro_user():
    db = _Session()
    user = User(
        email="pro@example.com",
        hashed_password=get_password_hash("pass"),
        is_active=True, is_verified=True,
        license_tier="pro",
    )
    db.add(user)
    db.commit()
    db.close()
    class _U:
        email = "pro@example.com"
    return _U()


@pytest.fixture
def ent_token(enterprise_user):
    return create_access_token({"sub": enterprise_user.email})


@pytest.fixture
def pro_token(pro_user):
    return create_access_token({"sub": pro_user.email})


def test_audit_log_list_requires_enterprise(client, pro_token):
    r = client.get("/api/v1/enterprise/audit-log", headers={"Authorization": f"Bearer {pro_token}"})
    assert r.status_code == 403


def test_audit_log_requires_admin_not_just_enterprise(client):
    # A non-admin enterprise user (auditor) must NOT read the audit log / PII.
    db = _Session()
    u = User(
        email="auditor_audit@example.com", hashed_password=get_password_hash("pass"),
        is_active=True, is_verified=True, license_tier="enterprise",
    )
    db.add(u); db.commit(); db.refresh(u)
    db.add(UserRole(user_id=u.id, role="auditor")); db.commit(); db.close()
    token = create_access_token({"sub": "auditor_audit@example.com"})
    r = client.get("/api/v1/enterprise/audit-log", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_audit_log_list_returns_empty_for_new_enterprise(client, ent_token):
    r = client.get("/api/v1/enterprise/audit-log", headers={"Authorization": f"Bearer {ent_token}"})
    assert r.status_code == 200
    assert r.json()["entries"] == []


def test_audit_log_verify_returns_valid_for_empty_chain(client, ent_token):
    r = client.get("/api/v1/enterprise/audit-log/verify", headers={"Authorization": f"Bearer {ent_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is True
    assert data["entries_checked"] == 0


def test_no_delete_endpoint_exists(client, ent_token):
    r = client.delete("/api/v1/enterprise/audit-log/1", headers={"Authorization": f"Bearer {ent_token}"})
    assert r.status_code == 405


def test_enterprise_blocked_on_shared_backend(client, ent_token, monkeypatch):
    # On the shared hosted backend (ENTERPRISE_MODE off), even an enterprise
    # admin must be denied — Enterprise is single-tenant/dedicated, so its data
    # can never coexist with other customers' on the shared backend.
    monkeypatch.setattr(settings, "enterprise_mode", False)
    r = client.get("/api/v1/enterprise/audit-log", headers={"Authorization": f"Bearer {ent_token}"})
    assert r.status_code == 403
