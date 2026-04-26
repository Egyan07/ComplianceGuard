"""
Unit tests for evidence upload security: size limit and path-traversal guard.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import timedelta

from app.main import app
from app.core.database import Base, get_db
from app.models.user import User
from app.models.evidence import EvidenceCollection, EvidenceItem
from app.core.auth import get_password_hash, create_access_token


_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _override_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=_engine)
    app.dependency_overrides[get_db] = _override_db
    yield
    Base.metadata.drop_all(bind=_engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_header():
    """Create a verified pro user and return its Bearer header."""
    db = _Session()
    user = User(
        email="sec@test.com",
        hashed_password=get_password_hash("Secure@1pass"),
        is_active=True,
        is_verified=True,
        license_tier="pro",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    token = create_access_token(
        {"sub": "sec@test.com"}, expires_delta=timedelta(minutes=30)
    )
    return {"Authorization": f"Bearer {token}"}


# ── upload size limit ─────────────────────────────────────────────────────────

def test_upload_rejects_disallowed_extension(client, auth_header):
    """Files with disallowed extensions must be rejected with 415."""
    resp = client.post(
        "/api/v1/evidence/upload",
        files={"file": ("malware.exe", b"MZ\x90\x00", "application/octet-stream")},
        headers=auth_header,
    )
    assert resp.status_code == 415, resp.text
    assert "not allowed" in resp.json()["detail"].lower()


def test_upload_rejects_oversized_file(client, auth_header):
    """Files larger than MAX_FILE_SIZE_MB must be rejected with 413."""
    from app.core.config import settings

    oversized = b"A" * (settings.max_file_size_mb * 1024 * 1024 + 1)
    resp = client.post(
        "/api/v1/evidence/upload",
        files={"file": ("big.pdf", oversized, "application/pdf")},
        headers=auth_header,
    )
    assert resp.status_code == 413, resp.text


# ── download path-traversal guard ────────────────────────────────────────────

def test_download_traversal_blocked(client, auth_header):
    """An evidence item whose storage_path escapes the root must return 404."""
    db = _Session()
    user = db.query(User).filter(User.email == "sec@test.com").first()

    coll = EvidenceCollection(
        collection_id="traversal-test-coll",
        user_id=user.id,
        status="completed",
        evidence_count=1,
        failed_count=0,
    )
    db.add(coll)
    db.flush()

    item = EvidenceItem(
        collection_id=coll.id,
        evidence_type="manual_upload",
        source="manual_upload",
        status="pending_review",
        # tampered path that escapes evidence storage root
        data={"storage_path": "/etc/passwd", "filename": "passwd"},
    )
    db.add(item)
    db.commit()
    item_id = item.id
    db.close()

    resp = client.get(
        f"/api/v1/evidence/items/{item_id}/download",
        headers=auth_header,
    )
    assert resp.status_code == 404, resp.text


def test_download_missing_file_returns_404(client, auth_header, tmp_path):
    """An item pointing to a non-existent file in the storage root must return 404."""
    from app.core.config import settings

    db = _Session()
    user = db.query(User).filter(User.email == "sec@test.com").first()

    coll = EvidenceCollection(
        collection_id="missing-file-coll",
        user_id=user.id,
        status="completed",
        evidence_count=1,
        failed_count=0,
    )
    db.add(coll)
    db.flush()

    ghost_path = str(tmp_path / "ghost.pdf")
    item = EvidenceItem(
        collection_id=coll.id,
        evidence_type="manual_upload",
        source="manual_upload",
        status="pending_review",
        data={"storage_path": ghost_path, "filename": "ghost.pdf"},
    )
    db.add(item)
    db.commit()
    item_id = item.id
    db.close()

    # Patch storage path so the traversal guard passes (file is within allowed root)
    import unittest.mock as mock
    with mock.patch.object(settings, "evidence_storage_path", str(tmp_path)):
        resp = client.get(
            f"/api/v1/evidence/items/{item_id}/download",
            headers=auth_header,
        )
    assert resp.status_code == 404, resp.text
