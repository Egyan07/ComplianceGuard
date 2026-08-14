"""Tests for GDPR (EU) 2016/679 framework loading and endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.gdpr_controls import GDPRFramework

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

def test_gdpr_loads_controls():
    fw = GDPRFramework()
    assert fw.get_control_count() >= 30


def test_gdpr_has_all_chapters():
    fw = GDPRFramework()
    chapters = {c.chapter for c in fw.get_all_controls()}
    for chapter in ["Principles", "Data Subject Rights", "Controller and Processor", "International Transfers"]:
        assert chapter in chapters, f"Chapter {chapter} missing"


def test_gdpr_has_core_articles():
    fw = GDPRFramework()
    ids = {c.id for c in fw.get_all_controls()}
    for cid in ["Art.5.1", "Art.6.1", "Art.17.1", "Art.32.1", "Art.33.1", "Art.35.1"]:
        assert cid in ids, f"Control {cid} missing"


def test_gdpr_unit_get_control_by_id():
    fw = GDPRFramework()
    ctrl = fw.get_control("Art.32.1")
    assert ctrl is not None
    assert ctrl.id == "Art.32.1"
    assert ctrl.risk_level == "high"


def test_gdpr_unit_get_controls_by_category():
    fw = GDPRFramework()
    rights = fw.get_controls_by_category("12")
    assert len(rights) >= 2


def test_gdpr_search():
    fw = GDPRFramework()
    results = fw.search_controls("erasure")
    assert len(results) >= 1


def test_gdpr_framework_summary(client):
    resp = client.get("/api/v1/gdpr/framework/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_controls"] >= 30
    assert "32" in data["categories"]
    assert "Data Subject Rights" in data["chapters"]


def test_gdpr_get_all_controls(client):
    resp = client.get("/api/v1/gdpr/framework/controls")
    assert resp.status_code == 200
    controls = resp.json()
    assert len(controls) >= 30
    assert all("chapter" in c for c in controls)


def test_gdpr_get_control_by_id(client):
    resp = client.get("/api/v1/gdpr/framework/controls/Art.32.1")
    assert resp.status_code == 200
    assert resp.json()["id"] == "Art.32.1"


def test_gdpr_get_controls_by_category(client):
    resp = client.get("/api/v1/gdpr/framework/controls/by-category/32")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_gdpr_invalid_category(client):
    resp = client.get("/api/v1/gdpr/framework/controls/by-category/99")
    assert resp.status_code == 400


def test_gdpr_search_controls(client):
    resp = client.get("/api/v1/gdpr/framework/controls/search?q=consent")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_gdpr_health(client):
    resp = client.get("/api/v1/gdpr/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"
    assert resp.json()["service"] == "gdpr-api"
