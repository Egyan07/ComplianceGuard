import pytest
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


def _seed(tier, role=None, email=None):
    db = _Session()
    email = email or f"{tier}_{role}@x.com"
    user = User(email=email, hashed_password=get_password_hash("p"), is_active=True, is_verified=True, license_tier=tier)
    db.add(user); db.commit(); db.refresh(user)
    if role:
        db.add(UserRole(user_id=user.id, role=role)); db.commit()
    token = create_access_token({"sub": user.email})
    uid = user.id
    db.close()
    return token, uid


def test_list_users_requires_enterprise(client):
    token, _ = _seed("pro")
    r = client.get("/api/v1/enterprise/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_list_users_returns_users_with_roles(client):
    token, _ = _seed("enterprise", "admin")
    r = client.get("/api/v1/enterprise/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_assign_role_requires_admin(client):
    token, uid = _seed("enterprise", "auditor")
    r = client.put(f"/api/v1/enterprise/users/{uid}/role", json={"role": "admin"}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_assign_role_success(client):
    admin_token, _ = _seed("enterprise", "admin", email="admin@x.com")
    _, target_uid = _seed("enterprise", None, email="target@x.com")
    r = client.put(f"/api/v1/enterprise/users/{target_uid}/role", json={"role": "auditor"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["role"] == "auditor"
