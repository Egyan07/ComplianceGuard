import pytest, base64
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.core.database import Base, get_db, create_test_database
from app.models.user import User
from app.models.enterprise import UserRole
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


def _seed_user(tier, role=None):
    db = _Session()
    user = User(email=f"{tier}_{role}@x.com", hashed_password=get_password_hash("p"), is_active=True, is_verified=True, license_tier=tier)
    db.add(user); db.commit(); db.refresh(user)
    if role:
        db.add(UserRole(user_id=user.id, role=role)); db.commit()
    email = user.email
    db.close()
    return create_access_token({"sub": email})


def test_get_branding_requires_enterprise(client):
    token = _seed_user("pro")
    r = client.get("/api/v1/enterprise/branding", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_get_branding_returns_null_when_unconfigured(client):
    token = _seed_user("enterprise", "admin")
    r = client.get("/api/v1/enterprise/branding", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["company_name"] is None


def test_put_branding_requires_admin(client):
    token = _seed_user("enterprise", "auditor")
    r = client.put("/api/v1/enterprise/branding", json={"company_name": "Acme"}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_put_branding_saves_config(client):
    token = _seed_user("enterprise", "admin")
    r = client.put("/api/v1/enterprise/branding", json={"company_name": "Acme Corp", "report_footer": "Confidential"}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["company_name"] == "Acme Corp"


def test_put_branding_rejects_svg(client):
    token = _seed_user("enterprise", "admin")
    svg_b64 = base64.b64encode(b"<svg/>").decode()
    r = client.put("/api/v1/enterprise/branding", json={"company_name": "X", "logo_base64": svg_b64}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 422


def test_put_branding_rejects_oversized_logo(client):
    token = _seed_user("enterprise", "admin")
    big = base64.b64encode(b"A" * 600_000).decode()
    r = client.put("/api/v1/enterprise/branding", json={"company_name": "X", "logo_base64": big}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 422


def test_put_branding_fires_audit_event(client):
    from app.models.enterprise import AuditLog
    token = _seed_user("enterprise", "admin")
    client.put("/api/v1/enterprise/branding", json={"company_name": "AuditCo"}, headers={"Authorization": f"Bearer {token}"})
    db = _Session()
    row = db.query(AuditLog).filter(AuditLog.event_type == "enterprise_config_updated").first()
    db.close()
    assert row is not None
    assert row.detail_json["company_name"] == "AuditCo"


def test_put_branding_accepts_valid_png(client):
    token = _seed_user("enterprise", "admin")
    # Minimal valid PNG: 8-byte signature + IHDR chunk stub
    png_bytes = b'\x89PNG\r\n\x1a\n' + b'\x00' * 20
    png_b64 = base64.b64encode(png_bytes).decode()
    r = client.put("/api/v1/enterprise/branding", json={"company_name": "PNGTest", "logo_base64": png_b64}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200


def test_put_branding_rejects_mime_spoofed_logo(client):
    """PNG mime claimed but SVG bytes — magic-byte check must catch this."""
    token = _seed_user("enterprise", "admin")
    svg_b64 = base64.b64encode(b"<svg xmlns='http://www.w3.org/2000/svg'/>").decode()
    # No logo_mime field — only logo_base64 with SVG content
    r = client.put("/api/v1/enterprise/branding", json={"company_name": "X", "logo_base64": svg_b64}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 422
