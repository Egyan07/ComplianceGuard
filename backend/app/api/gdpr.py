"""
GDPR Framework API — read-only endpoints for browsing obligations.
Mirrors iso27001.py but uses GDPRFramework and GDPRControl.
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.compliance import ComplianceEvaluationResponse, _counts_from_totals, _response_from_record
from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.exceptions import EvaluationError
from app.core.canonical_router import evaluate_from_evidence_canonical
from app.core.gdpr_controls import GDPRControl, GDPRFramework, create_gdpr_framework
from app.models.evaluation import ComplianceEvaluationRecord
from app.models.user import User

router = APIRouter(prefix="/gdpr", tags=["gdpr"])

_VALID_CATEGORIES = [
    "5", "6", "7", "8", "9",
    "12", "13", "14", "15", "16", "17", "18", "20", "21", "22",
    "24", "25", "28", "30", "31", "32", "33", "34", "35", "36", "37",
    "44", "46", "47",
]

_gdpr_framework = create_gdpr_framework()


def get_gdpr_framework() -> GDPRFramework:
    return _gdpr_framework


class GDPRControlResponse(BaseModel):
    id: str
    title: str
    description: str
    category: str
    chapter: str
    control_objective: str
    implementation_guidance: str
    related_controls: List[str]
    risk_level: str


class GDPRFrameworkSummaryResponse(BaseModel):
    total_controls: int
    categories: Dict[str, int]
    chapters: Dict[str, int]
    risk_distribution: Dict[str, int]


def _to_response(c: GDPRControl) -> GDPRControlResponse:
    return GDPRControlResponse(
        id=c.id,
        title=c.title,
        description=c.description,
        category=c.category,
        chapter=c.chapter,
        control_objective=c.control_objective,
        implementation_guidance=c.implementation_guidance,
        related_controls=c.related_controls,
        risk_level=c.risk_level,
    )


@router.get("/framework/summary", response_model=GDPRFrameworkSummaryResponse)
async def get_summary(fw: GDPRFramework = Depends(get_gdpr_framework)):
    return fw.get_framework_summary()


@router.get("/framework/controls", response_model=List[GDPRControlResponse])
async def get_all_controls(fw: GDPRFramework = Depends(get_gdpr_framework)):
    return [_to_response(c) for c in fw.get_all_controls()]


@router.get("/framework/controls/search", response_model=List[GDPRControlResponse])
async def search_controls(
    q: str = Query(..., min_length=2),
    fw: GDPRFramework = Depends(get_gdpr_framework),
):
    return [_to_response(c) for c in fw.search_controls(q)]


@router.get("/framework/controls/by-category/{category}", response_model=List[GDPRControlResponse])
async def get_by_category(
    category: str,
    fw: GDPRFramework = Depends(get_gdpr_framework),
):
    if category not in _VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid article. Must be one of: {', '.join(_VALID_CATEGORIES)}",
        )
    return [_to_response(c) for c in fw.get_controls_by_category(category)]


@router.get("/framework/controls/{control_id}", response_model=GDPRControlResponse)
async def get_control(
    control_id: str,
    fw: GDPRFramework = Depends(get_gdpr_framework),
):
    ctrl = fw.get_control(control_id)
    if not ctrl:
        raise HTTPException(status_code=404, detail=f"Control {control_id} not found")
    return _to_response(ctrl)


@router.get("/health")
async def health(fw: GDPRFramework = Depends(get_gdpr_framework)):
    return {
        "status": "healthy",
        "service": "gdpr-api",
        "framework_controls": fw.get_control_count(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/evaluate-from-evidence", response_model=ComplianceEvaluationResponse)
async def evaluate_from_evidence(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Auto-evaluate GDPR compliance from the user's stored evidence items."""
    from app.models.evidence import EvidenceCollection as EvColl, EvidenceItem as EvItem

    items = (
        db.query(EvItem)
        .join(EvColl)
        .filter(EvColl.user_id == current_user.id)
        .all()
    )

    # Canonical coverage engine (single scoring path).
    evidence_types = [item.evidence_type for item in items]
    totals = evaluate_from_evidence_canonical("gdpr", evidence_types)

    try:
        evidence_summary = dict(totals.get("evidence_summary") or {})
        evidence_summary["control_counts"] = _counts_from_totals(totals)
        record = ComplianceEvaluationRecord(
            evaluation_id=f"eval-{uuid.uuid4().hex[:12]}",
            framework_id=totals["framework_id"],
            user_id=current_user.id,
            overall_score=totals["overall_score"],
            compliance_status=totals["compliance_status"],
            compliance_level=totals["compliance_level"],
            evaluated_by="web_auto",
            scope=None,
            evidence_summary=evidence_summary,
            risk_assessment=totals["risk_assessment"],
            recommendations=totals["recommendations"],
            control_count=totals["control_count"],
            compliant_controls=totals["compliant_controls"],
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        return _response_from_record(record)
    except Exception as exc:
        db.rollback()
        raise EvaluationError(log_message=f"GDPR evaluation failed (user={current_user.email})") from exc
