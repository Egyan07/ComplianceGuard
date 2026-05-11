"""
ISO 27001 Framework API — read-only endpoints for browsing controls.
Mirrors the read-only surface of compliance.py but uses ISO27001Framework.
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.compliance import ComplianceEvaluationResponse
from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.framework_scoring import score_from_map, derive_overall
from app.core.iso27001_controls import ISO27001Control, ISO27001Framework, create_iso27001_framework
from app.core.iso27001_evidence_map import ISO27001_EVIDENCE_CONTROL_MAP
from app.models.evaluation import ComplianceEvaluationRecord
from app.models.user import User

router = APIRouter(prefix="/iso27001", tags=["iso27001"])

_VALID_DOMAINS = [f"A.{n}" for n in range(5, 19)]

_iso27001_framework = create_iso27001_framework()


def get_iso27001_framework() -> ISO27001Framework:
    return _iso27001_framework


class ISO27001ControlResponse(BaseModel):
    id: str
    title: str
    description: str
    category: str
    control_objective: str
    implementation_guidance: str
    related_controls: List[str]
    risk_level: str


class FrameworkSummaryResponse(BaseModel):
    total_controls: int
    categories: Dict[str, int]
    risk_distribution: Dict[str, int]


def _to_response(c: ISO27001Control) -> ISO27001ControlResponse:
    return ISO27001ControlResponse(
        id=c.id,
        title=c.title,
        description=c.description,
        category=c.category,
        control_objective=c.control_objective,
        implementation_guidance=c.implementation_guidance,
        related_controls=c.related_controls,
        risk_level=c.risk_level,
    )


@router.get("/framework/summary", response_model=FrameworkSummaryResponse)
async def get_summary(fw: ISO27001Framework = Depends(get_iso27001_framework)):
    return fw.get_framework_summary()


@router.get("/framework/controls", response_model=List[ISO27001ControlResponse])
async def get_all_controls(fw: ISO27001Framework = Depends(get_iso27001_framework)):
    return [_to_response(c) for c in fw.get_all_controls()]


@router.get("/framework/controls/search", response_model=List[ISO27001ControlResponse])
async def search_controls(
    q: str = Query(..., min_length=2),
    fw: ISO27001Framework = Depends(get_iso27001_framework),
):
    return [_to_response(c) for c in fw.search_controls(q)]


@router.get("/framework/controls/by-category/{category}", response_model=List[ISO27001ControlResponse])
async def get_by_category(
    category: str,
    fw: ISO27001Framework = Depends(get_iso27001_framework),
):
    if category not in _VALID_DOMAINS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid domain. Must be one of: {', '.join(_VALID_DOMAINS)}",
        )
    return [_to_response(c) for c in fw.get_controls_by_category(category)]


@router.get("/framework/controls/{control_id}", response_model=ISO27001ControlResponse)
async def get_control(
    control_id: str,
    fw: ISO27001Framework = Depends(get_iso27001_framework),
):
    ctrl = fw.get_control(control_id)
    if not ctrl:
        raise HTTPException(status_code=404, detail=f"Control {control_id} not found")
    return _to_response(ctrl)


@router.get("/health")
async def health(fw: ISO27001Framework = Depends(get_iso27001_framework)):
    return {
        "status": "healthy",
        "service": "iso27001-api",
        "framework_controls": fw.get_control_count(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/evaluate-from-evidence", response_model=ComplianceEvaluationResponse)
async def evaluate_from_evidence(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Auto-evaluate ISO 27001 compliance from the user's stored evidence items."""
    from app.models.evidence import EvidenceCollection as EvColl, EvidenceItem as EvItem

    items = (
        db.query(EvItem)
        .join(EvColl)
        .filter(EvColl.user_id == current_user.id)
        .all()
    )

    control_scores = score_from_map(items, ISO27001_EVIDENCE_CONTROL_MAP)
    totals = derive_overall(control_scores)

    try:
        record = ComplianceEvaluationRecord(
            evaluation_id=f"eval-{uuid.uuid4().hex[:12]}",
            framework_id="iso27001_v2013",
            user_id=current_user.id,
            overall_score=totals["overall_score"],
            compliance_status=totals["compliance_status"],
            compliance_level=totals["compliance_level"],
            evaluated_by="web_auto",
            scope=list({c.category for c in _iso27001_framework.get_all_controls()}),
            evidence_summary={"total_evidence": len(items)},
            risk_assessment={},
            recommendations=[],
            control_count=totals["control_count"],
            compliant_controls=totals["compliant_controls"],
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        return ComplianceEvaluationResponse(
            framework_id=record.framework_id,
            overall_score=record.overall_score,
            compliance_status=record.compliance_status,
            compliance_level=record.compliance_level,
            evaluation_date=record.created_at,
            evaluated_by=record.evaluated_by,
            scope=record.scope or [],
            evidence_summary=record.evidence_summary or {},
            risk_assessment=record.risk_assessment or {},
            recommendations=record.recommendations or [],
            next_review_date=None,
            control_count=record.control_count,
            compliant_controls=record.compliant_controls,
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")
