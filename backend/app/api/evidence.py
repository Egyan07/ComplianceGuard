"""
Evidence Collection API Endpoints

REST API endpoints for managing and collecting compliance evidence.
"""

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.credential_crypto import decrypt_credential
from app.core.database import get_db
from app.models.aws_credential import AwsCredential
from app.models.evidence import EvidenceCollection, EvidenceItem
from app.models.user import User
from app.services.evidence_collector import EvidenceCollectionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/evidence", tags=["evidence"])

# Pre-compute max bytes and chunk size once so they aren't recalculated per request
_MAX_UPLOAD_BYTES = settings.max_file_size_mb * 1024 * 1024
_UPLOAD_CHUNK_BYTES = 1024 * 1024  # 1 MB read chunks for streaming uploads


_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]")


def _validate_upload(filename: str, size: int) -> None:
    """Raise HTTPException if the file fails size or type checks."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in settings.allowed_file_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File type '{ext}' is not allowed. "
                f"Permitted types: {', '.join(settings.allowed_file_types)}"
            ),
        )
    if size > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"File size {size / (1024 * 1024):.1f} MB exceeds the "
                f"{settings.max_file_size_mb} MB limit."
            ),
        )


def _safe_filename(filename: str) -> str:
    """Strip path components and non-safe characters from a user-supplied name."""
    base = os.path.basename(filename)
    cleaned = _SAFE_NAME_RE.sub("_", base).strip("._")
    return cleaned or "upload"


def _evidence_dir_for_user(user_id: int) -> str:
    """Return (and create) the per-user evidence directory."""
    root = os.path.abspath(settings.evidence_storage_path)
    user_dir = os.path.join(root, "evidence", str(user_id))
    os.makedirs(user_dir, exist_ok=True)
    return user_dir


def _store_evidence_file(user_id: int, original_name: str, content: bytes) -> str:
    """
    Write ``content`` to the per-user evidence directory and return the
    absolute path. A UUID prefix prevents collisions across uploads with the
    same original name.
    """
    user_dir = _evidence_dir_for_user(user_id)
    safe_name = _safe_filename(original_name)
    storage_name = f"{uuid.uuid4().hex}_{safe_name}"
    full_path = os.path.join(user_dir, storage_name)
    with open(full_path, "wb") as fp:
        fp.write(content)
    return full_path


# --- Request / Response models ---

class EvidenceCollectionRequest(BaseModel):
    collection_types: Optional[list[str]] = None


class EvidenceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    evidence_type: str
    source: str
    status: str
    data: Optional[Dict[str, Any]] = None
    created_at: str


class EvidenceCollectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    collection_id: str
    status: str
    evidence_count: int
    failed_count: int
    summary: Optional[Dict[str, Any]] = None
    created_at: str
    items: List[EvidenceItemResponse] = []


class EvidenceSummaryResponse(BaseModel):
    total_collections: int
    total_evidence_items: int
    last_collection: Optional[str] = None
    compliance_metrics: Dict[str, Any]


# --- Endpoints ---

@router.post("/collect", response_model=EvidenceCollectionResponse)
async def collect_evidence(
    request: EvidenceCollectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Collect compliance evidence from configured sources and persist results."""
    try:
        logger.info(f"Starting evidence collection for user: {current_user.email}")

        evidence_service = EvidenceCollectionService()

        # Load AWS credentials from DB — never from the request body
        cred = (
            db.query(AwsCredential)
            .filter(AwsCredential.user_id == current_user.id)
            .first()
        )

        if cred:
            try:
                aws_creds = {
                    "aws_access_key_id": decrypt_credential(
                        cred.encrypted_access_key_id, settings.secret_key
                    ),
                    "aws_secret_access_key": decrypt_credential(
                        cred.encrypted_secret_access_key, settings.secret_key
                    ),
                    "region_name": cred.region,
                }
                bundle = evidence_service.collect_all_evidence(**aws_creds)
            except Exception as crypto_err:
                logger.error("Failed to decrypt AWS credentials for user %s: %s", current_user.email, crypto_err)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Could not decrypt stored AWS credentials. Re-save them in Settings.",
                )
        else:
            bundle = evidence_service.collect_all_evidence()

        # Persist the collection run
        collection = EvidenceCollection(
            collection_id=bundle["collection_id"],
            user_id=current_user.id,
            status=bundle["collection_status"],
            evidence_count=bundle["evidence_count"],
            failed_count=len(bundle["failed_collections"]),
            summary=bundle.get("summary"),
        )
        db.add(collection)
        db.flush()  # get collection.id

        # Persist individual evidence items
        for item in bundle["evidence_items"]:
            db_item = EvidenceItem(
                collection_id=collection.id,
                evidence_type=item.get("evidence_type", "unknown"),
                source=item.get("source", "aws"),
                status="compliant",
                data=item,
            )
            db.add(db_item)

        db.commit()
        db.refresh(collection)

        return EvidenceCollectionResponse(
            collection_id=collection.collection_id,
            status=collection.status,
            evidence_count=collection.evidence_count,
            failed_count=collection.failed_count,
            summary=collection.summary,
            created_at=collection.created_at.isoformat(),
            items=[
                EvidenceItemResponse(
                    id=i.id,
                    evidence_type=i.evidence_type,
                    source=i.source,
                    status=i.status,
                    data=i.data,
                    created_at=i.created_at.isoformat(),
                )
                for i in collection.items
            ],
        )

    except Exception as e:
        db.rollback()
        error_msg = f"Evidence collection failed: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_msg)


@router.get("/status/{collection_id}", response_model=EvidenceCollectionResponse)
async def get_collection_status(
    collection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get status of an evidence collection by its collection_id."""
    collection = (
        db.query(EvidenceCollection)
        .options(selectinload(EvidenceCollection.items))
        .filter(
            EvidenceCollection.collection_id == collection_id,
            EvidenceCollection.user_id == current_user.id,
        )
        .first()
    )
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    return EvidenceCollectionResponse(
        collection_id=collection.collection_id,
        status=collection.status,
        evidence_count=collection.evidence_count,
        failed_count=collection.failed_count,
        summary=collection.summary,
        created_at=collection.created_at.isoformat(),
        items=[
            EvidenceItemResponse(
                id=i.id,
                evidence_type=i.evidence_type,
                source=i.source,
                status=i.status,
                data=i.data,
                created_at=i.created_at.isoformat(),
            )
            for i in collection.items
        ],
    )


@router.get("/summary", response_model=EvidenceSummaryResponse)
async def get_evidence_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get summary of all evidence collections for the current user."""
    collections = (
        db.query(EvidenceCollection)
        .filter(EvidenceCollection.user_id == current_user.id)
        .order_by(EvidenceCollection.created_at.desc())
        .all()
    )

    total_items = sum(c.evidence_count for c in collections)
    last_collection = collections[0].created_at.isoformat() if collections else None

    # Aggregate compliance metrics from most recent collection
    metrics: Dict[str, Any] = {
        "s3_encryption_compliance": 0,
        "iam_policy_compliance": 0,
        "overall_compliance_score": 0,
    }
    if collections and collections[0].summary:
        cm = collections[0].summary.get("compliance_metrics", {})
        metrics["s3_encryption_compliance"] = cm.get("s3_encryption_compliance_rate", 0)
        metrics["iam_policy_compliance"] = cm.get("iam_compliance_rate", 0)
        # Simple average for overall
        scores = [v for v in [metrics["s3_encryption_compliance"], metrics["iam_policy_compliance"]] if v > 0]
        metrics["overall_compliance_score"] = round(sum(scores) / len(scores), 1) if scores else 0

    return EvidenceSummaryResponse(
        total_collections=len(collections),
        total_evidence_items=total_items,
        last_collection=last_collection,
        compliance_metrics=metrics,
    )


@router.get("/items", response_model=List[EvidenceItemResponse])
async def get_evidence_items(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    """Get all evidence items for the current user."""
    items = (
        db.query(EvidenceItem)
        .join(EvidenceCollection)
        .filter(EvidenceCollection.user_id == current_user.id)
        .order_by(EvidenceItem.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        EvidenceItemResponse(
            id=i.id,
            evidence_type=i.evidence_type,
            source=i.source,
            status=i.status,
            data=i.data,
            created_at=i.created_at.isoformat(),
        )
        for i in items
    ]


@router.get("/collections", response_model=List[EvidenceCollectionResponse])
async def get_all_collections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 20,
    offset: int = 0,
):
    """Get all evidence collection runs for the current user."""
    collections = (
        db.query(EvidenceCollection)
        .filter(EvidenceCollection.user_id == current_user.id)
        .order_by(EvidenceCollection.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        EvidenceCollectionResponse(
            collection_id=c.collection_id,
            status=c.status,
            evidence_count=c.evidence_count,
            failed_count=c.failed_count,
            summary=c.summary,
            created_at=c.created_at.isoformat(),
        )
        for c in collections
    ]


class UploadEvidenceResponse(BaseModel):
    """Response model for manual file evidence upload."""
    evidence_item_id: int
    filename: str
    file_size_bytes: int
    evidence_type: str
    created_at: str


@router.post("/upload", response_model=UploadEvidenceResponse, status_code=status.HTTP_201_CREATED)
async def upload_evidence_file(
    file: UploadFile = File(...),
    evidence_type: str = "manual_upload",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a manual evidence file.

    Enforces server-side file type and size limits from application settings
    (MAX_FILE_SIZE_MB, ALLOWED_FILE_TYPES). The file bytes are streamed in
    1 MB chunks and rejected as soon as the running total exceeds the limit —
    avoiding loading multi-gigabyte uploads fully into memory before refusing.
    """
    filename = file.filename or "upload"

    # Extension check is free (uses the filename header) — do it before reading.
    ext = os.path.splitext(filename)[1].lower()
    if ext not in settings.allowed_file_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File type '{ext}' is not allowed. "
                f"Permitted types: {', '.join(settings.allowed_file_types)}"
            ),
        )

    # Stream in 1 MB chunks — fail fast on oversized uploads.
    content = bytearray()
    while True:
        chunk = await file.read(_UPLOAD_CHUNK_BYTES)
        if not chunk:
            break
        content.extend(chunk)
        if len(content) > _MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds the {settings.max_file_size_mb} MB upload limit.",
            )
    content = bytes(content)

    stored_path = _store_evidence_file(current_user.id, filename, content)

    # Find or create a collection for manual uploads
    collection_id = str(uuid.uuid4())
    collection = EvidenceCollection(
        collection_id=collection_id,
        user_id=current_user.id,
        status="completed",
        evidence_count=1,
        failed_count=0,
        summary={"source": "manual_upload", "filename": filename},
    )
    db.add(collection)
    db.flush()

    item = EvidenceItem(
        collection_id=collection.id,
        evidence_type=evidence_type,
        source="manual_upload",
        status="pending_review",
        data={
            "filename": filename,
            "file_size_bytes": len(content),
            "storage_path": stored_path,
            "uploaded_by": current_user.email,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.add(item)

    try:
        db.commit()
    except Exception:
        # DB write failed — remove the orphaned file so we don't leak storage.
        try:
            os.remove(stored_path)
        except OSError:
            pass
        raise

    db.refresh(item)

    logger.info(
        "Manual evidence uploaded: user=%s file=%s size=%d bytes stored_name=%s",
        current_user.email,
        filename,
        len(content),
        os.path.basename(stored_path),  # basename only — don't leak full host paths
    )

    return UploadEvidenceResponse(
        evidence_item_id=item.id,
        filename=filename,
        file_size_bytes=len(content),
        evidence_type=evidence_type,
        created_at=item.created_at.isoformat(),
    )


@router.get("/items/{item_id}/download")
async def download_evidence_file(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stream the stored bytes for a manually-uploaded evidence item.

    Only the owning user can download the file; the DB-stored path is
    confirmed to live under the configured evidence storage root before the
    FileResponse is returned, so a tampered `data.storage_path` cannot be
    used to read arbitrary files off the host.
    """
    item = (
        db.query(EvidenceItem)
        .join(EvidenceCollection)
        .filter(
            EvidenceItem.id == item_id,
            EvidenceCollection.user_id == current_user.id,
        )
        .first()
    )
    if not item or not item.data or not item.data.get("storage_path"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence file not found")

    storage_path = os.path.abspath(item.data["storage_path"])
    allowed_root = os.path.abspath(settings.evidence_storage_path)
    if not storage_path.startswith(allowed_root + os.sep) and storage_path != allowed_root:
        logger.error("Blocked path-traversal attempt: item=%d name=%s", item_id, os.path.basename(storage_path))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence file not found")

    if not os.path.exists(storage_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence file missing from storage")

    return FileResponse(
        storage_path,
        filename=item.data.get("filename", os.path.basename(storage_path)),
    )
