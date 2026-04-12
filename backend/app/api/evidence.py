"""
Evidence Collection API Endpoints

REST API endpoints for managing and collecting compliance evidence.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.evidence import EvidenceCollection, EvidenceItem
from app.services.evidence_collector import EvidenceCollectionService

router = APIRouter(prefix="/evidence", tags=["evidence"])


# --- Request / Response models ---

class AWSCredentials(BaseModel):
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str = "us-east-1"


class EvidenceCollectionRequest(BaseModel):
    aws_credentials: Optional[AWSCredentials] = None
    collection_types: Optional[list[str]] = None


class EvidenceItemResponse(BaseModel):
    id: int
    evidence_type: str
    source: str
    status: str
    data: Optional[Dict[str, Any]] = None
    created_at: str

    class Config:
        from_attributes = True


class EvidenceCollectionResponse(BaseModel):
    collection_id: str
    status: str
    evidence_count: int
    failed_count: int
    summary: Optional[Dict[str, Any]] = None
    created_at: str
    items: List[EvidenceItemResponse] = []

    class Config:
        from_attributes = True


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

        if request.aws_credentials:
            aws_creds = {
                "aws_access_key_id": request.aws_credentials.aws_access_key_id,
                "aws_secret_access_key": request.aws_credentials.aws_secret_access_key,
                "region_name": request.aws_credentials.aws_region,
            }
            bundle = evidence_service.collect_all_evidence(**aws_creds)
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
