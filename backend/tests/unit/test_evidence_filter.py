"""Tests for evidence list search and status filter query params."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core.auth import get_password_hash
from app.models.user import User
from app.models.evidence import EvidenceCollection, EvidenceItem


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
def auth_client():
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)

    db = TestSession()
    try:
        user = User(
            email="filter@example.com",
            hashed_password=get_password_hash("Filter@1pass"),
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        col = EvidenceCollection(
            collection_id="col-filter-1",
            user_id=user.id,
            status="completed",
            evidence_count=2,
            failed_count=0,
        )
        db.add(col)
        db.flush()
        db.add(EvidenceItem(
            collection_id=col.id,
            evidence_type="s3_encryption",
            source="aws",
            status="compliant",
            data={},
        ))
        db.add(EvidenceItem(
            collection_id=col.id,
            evidence_type="iam_policy",
            source="aws",
            status="non_compliant",
            data={},
        ))
        db.commit()
    finally:
        db.close()

    resp = client.post("/api/v1/auth/login", data={
        "username": "filter@example.com",
        "password": "Filter@1pass",
    })
    token = resp.json()["access_token"]
    yield client, token
    app.dependency_overrides.clear()


def test_filter_by_status_compliant(auth_client):
    client, token = auth_client
    resp = client.get(
        "/api/v1/evidence/items?status=compliant",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    items = resp.json()
    assert all(i["status"] == "compliant" for i in items)
    assert len(items) == 1


def test_filter_by_status_non_compliant(auth_client):
    client, token = auth_client
    resp = client.get(
        "/api/v1/evidence/items?status=non_compliant",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_search_by_type(auth_client):
    client, token = auth_client
    resp = client.get(
        "/api/v1/evidence/items?search=s3",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["evidence_type"] == "s3_encryption"


def test_no_filter_returns_all(auth_client):
    client, token = auth_client
    resp = client.get(
        "/api/v1/evidence/items",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2
