"""Tests for ISO 27001 framework loading and endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.iso27001_controls import ISO27001Framework


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


# ── Framework unit tests ────────────────────────────────────────────────────

def test_iso27001_loads_controls():
    fw = ISO27001Framework()
    # ISO/IEC 27001:2022 Annex A has exactly 93 controls.
    assert fw.get_control_count() == 93


def test_iso27001_has_all_domains():
    # 2022 restructured Annex A into four themes (2013's A.9-A.18 no longer exist).
    fw = ISO27001Framework()
    categories = {c.category for c in fw.get_all_controls()}
    for domain in ["A.5", "A.6", "A.7", "A.8"]:
        assert domain in categories, f"Domain {domain} missing"
    assert categories == {"A.5", "A.6", "A.7", "A.8"}


def test_iso27001_unit_get_control_by_id():
    fw = ISO27001Framework()
    ctrl = fw.get_control("A.8.15")
    assert ctrl is not None
    assert ctrl.id == "A.8.15"
    assert ctrl.title == "Logging"


def test_iso27001_unit_get_controls_by_category():
    fw = ISO27001Framework()
    a8 = fw.get_controls_by_category("A.8")
    assert len(a8) == 34  # Technological controls


def test_iso27001_search():
    fw = ISO27001Framework()
    results = fw.search_controls("access")
    assert len(results) >= 1


# ── API endpoint tests ───────────────────────────────────────────────────────

def test_iso27001_framework_summary(client):
    resp = client.get("/api/v1/iso27001/framework/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_controls"] == 93
    assert "A.8" in data["categories"]


def test_iso27001_get_all_controls(client):
    resp = client.get("/api/v1/iso27001/framework/controls")
    assert resp.status_code == 200
    assert len(resp.json()) == 93


def test_iso27001_get_control_by_id(client):
    resp = client.get("/api/v1/iso27001/framework/controls/A.8.15")
    assert resp.status_code == 200
    assert resp.json()["id"] == "A.8.15"


def test_iso27001_get_controls_by_category(client):
    resp = client.get("/api/v1/iso27001/framework/controls/by-category/A.8")
    assert resp.status_code == 200
    assert len(resp.json()) == 34


def test_iso27001_invalid_category(client):
    resp = client.get("/api/v1/iso27001/framework/controls/by-category/INVALID")
    assert resp.status_code == 400


def test_iso27001_search_controls(client):
    resp = client.get("/api/v1/iso27001/framework/controls/search?q=access")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_iso27001_health(client):
    resp = client.get("/api/v1/iso27001/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"
