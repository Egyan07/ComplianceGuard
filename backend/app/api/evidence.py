"""
Evidence Collection API Endpoints

REST API endpoints for managing and collecting compliance evidence.
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, ConfigDict
from datetime import datetime, timezone
import logging
import os

logger = logging.getLogger(__name__)

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.config import settings
from app.core.credential_crypto import decrypt_credential
from app.models.user import User
from app.models.evidence import EvidenceCollection, EvidenceItem
from app.models.aws_credential import AwsCredential
from app.services.evidence_collector import EvidenceCollectionService

router = APIRouter(prefix="/evidence", tags=["evidence"])

# Pre-compute max bytes once so it isn't recalculated per request
_MAX_UPLOAD_BYTES = settings.max_file_size_mb * 1024 * 1024


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
    (MAX_FILE_SIZE_MB, ALLOWED_FILE_TYPES).  The file content is stored as
    base64 inside the evidence item's data JSON column — suitable for files
    up to the configured limit.
    """
    # Read into memory first so we know the real size (Content-Length is
    # untrustworthy and multipart doesn't guarantee it).
    content = await file.read()
    filename = file.filename or "upload"

    _validate_upload(filename, len(content))

    import base64
    import uuid

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
            "content_base64": base64.b64encode(content).decode("utf-8"),
            "uploaded_by": current_user.email,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    logger.info(
        "Manual evidence uploaded: user=%s file=%s size=%d bytes",
        current_user.email,
        filename,
        len(content),
    )

    return UploadEvidenceResponse(
        evidence_item_id=item.id,
        filename=filename,
        file_size_bytes=len(content),
        evidence_type=evidence_type,
        created_at=item.created_at.isoformat(),
    )
