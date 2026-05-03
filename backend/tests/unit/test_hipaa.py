"""Tests for HIPAA Security Rule framework loading and endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.hipaa_controls import HIPAAFramework

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


def override_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = override_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_hipaa_loads_controls():
    fw = HIPAAFramework()
    assert fw.get_control_count() >= 40


def test_hipaa_has_all_sections():
    fw = HIPAAFramework()
    categories = {c.category for c in fw.get_all_controls()}
    for section in ["164.308", "164.310", "164.312", "164.314", "164.316"]:
        assert section in categories, f"Section {section} missing"


def test_hipaa_unit_get_control_by_id():
    fw = HIPAAFramework()
    ctrl = fw.get_control("164.312.a.2.i")
    assert ctrl is not None
    assert ctrl.id == "164.312.a.2.i"


def test_hipaa_unit_get_controls_by_category():
    fw = HIPAAFramework()
    admin = fw.get_controls_by_category("164.308")
    assert len(admin) >= 8


def test_hipaa_search():
    fw = HIPAAFramework()
    results = fw.search_controls("encryption")
    assert len(results) >= 1


def test_hipaa_framework_summary(client):
    resp = client.get("/api/v1/hipaa/framework/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_controls"] >= 40
    assert "164.308" in data["categories"]


def test_hipaa_get_all_controls(client):
    resp = client.get("/api/v1/hipaa/framework/controls")
    assert resp.status_code == 200
    assert len(resp.json()) >= 40


def test_hipaa_get_control_by_id(client):
    resp = client.get("/api/v1/hipaa/framework/controls/164.312.a.2.i")
    assert resp.status_code == 200
    assert resp.json()["id"] == "164.312.a.2.i"


def test_hipaa_get_controls_by_category(client):
    resp = client.get("/api/v1/hipaa/framework/controls/by-category/164.308")
    assert resp.status_code == 200
    assert len(resp.json()) >= 8


def test_hipaa_invalid_category(client):
    resp = client.get("/api/v1/hipaa/framework/controls/by-category/INVALID")
    assert resp.status_code == 400


def test_hipaa_search_controls(client):
    resp = client.get("/api/v1/hipaa/framework/controls/search?q=encryption")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_hipaa_health(client):
    resp = client.get("/api/v1/hipaa/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"
