"""
Compliance API endpoints for SOC 2 framework management and evaluation.

This module provides FastAPI endpoints for:
- SOC 2 framework management
- Control assessment and evaluation
- Compliance reporting
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session, selectinload
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid
import logging
import re

from app.core.soc2_controls import SOC2Control, SOC2Framework, create_soc2_framework
from app.core.database import get_db
from app.api.deps import get_current_user, require_pro
from app.core.exceptions import EvaluationError
from app.models.user import User
from app.models.evaluation import ComplianceEvaluationRecord, ControlAssessmentRecord
from app.core.canonical_router import evaluate_from_evidence_canonical


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["compliance"])

# Read-only singleton — safe to share across workers; controls never mutate at runtime.
_soc2_framework = create_soc2_framework()


def get_soc2_framework() -> SOC2Framework:
    return _soc2_framework


# --- Legacy (pre-Phase-5) record normalization ---------------------------------
#
# Evaluations persisted before the canonical migration used a 0-1 overall_score
# and the legacy status vocabulary. The three statuses below NEVER occur in
# canonical records (canonical uses compliant/partial/non_compliant/not_assessed),
# so their presence reliably marks a record as legacy. Normalization happens on
# the read path so history/trend/reports keep displaying correctly while the
# stored rows are left untouched (canonical records are never modified).
_LEGACY_ONLY_STATUSES = {"partially_compliant", "not_applicable", "not_evaluated"}
_STATUS_TO_CANONICAL = {
    "partially_compliant": "partial",
    "not_applicable": "not_assessed",
    "not_evaluated": "not_assessed",
}


def _is_legacy_record(record: ComplianceEvaluationRecord) -> bool:
    """True when the record was written on the legacy 0-1 scale."""
    if record.compliance_status in _LEGACY_ONLY_STATUSES:
        return True
    return any(a.status in _LEGACY_ONLY_STATUSES for a in record.assessments)


def _normalize_overall_score(value: float) -> float:
    """Scale a legacy 0-1 overall score to the canonical 0-100 contract."""
    return round(value * 100, 4)


def _normalize_control_score(value: float) -> float:
    """Scale a legacy 0-1 per-control score to canonical 0-100 (int, like the engine)."""
    return round(value * 100)


def _canonical_status(status: str) -> str:
    """Map a legacy status to its canonical equivalent (passthrough otherwise)."""
    return _STATUS_TO_CANONICAL.get(status, status)


def _normalized_record_view(record: ComplianceEvaluationRecord) -> Dict[str, Any]:
    """Return (overall_score, compliance_status) in the canonical contract."""
    if not _is_legacy_record(record):
        return {"overall_score": record.overall_score, "compliance_status": record.compliance_status}
    return {
        "overall_score": _normalize_overall_score(record.overall_score),
        "compliance_status": _canonical_status(record.compliance_status),
    }


# Pydantic models for API requests/responses

class ControlEvidenceRequest(BaseModel):
    """Request model for control evidence submission."""
    evidence_provided: List[str] = Field(..., description="List of evidence IDs provided")
    status: str = Field(..., description="Control status")
    score: float = Field(..., ge=0.0, le=1.0, description="Compliance score (0.0-1.0)")
    comments: Optional[str] = Field(None, description="Additional comments")


class ComplianceEvaluationRequest(BaseModel):
    """Request model for compliance evaluation."""
    scope: Optional[List[str]] = Field(None, description="List of control categories to evaluate")
    evidence_data: Dict[str, ControlEvidenceRequest] = Field(..., description="Evidence data by control ID")
    evaluated_by: str = Field("system", description="Evaluator identifier")


class ControlResponse(BaseModel):
    """Response model for SOC 2 control."""
    id: str
    title: str
    description: str
    category: str
    control_objective: str
    implementation_guidance: str
    evidence_mapping: List[Dict[str, str]]
    related_controls: List[str]
    risk_level: str


class FrameworkSummaryResponse(BaseModel):
    """Response model for framework summary."""
    total_controls: int
    categories: Dict[str, int]
    risk_distribution: Dict[str, int]


class ComplianceEvaluationResponse(BaseModel):
    """Response model for compliance evaluation results.

    The control-status counts (partial/non_compliant/not_assessed) are part of
    the canonical contract (Phase 5). They default to 0 so legacy serializers
    and pre-Phase-6 persisted records (which did not carry them) still validate.
    """
    framework_id: str
    overall_score: float
    compliance_status: str
    compliance_level: str
    evaluation_date: datetime
    evaluated_by: str
    scope: List[str]
    evidence_summary: Dict[str, Any]
    risk_assessment: Dict[str, Any]
    recommendations: List[str]
    next_review_date: Optional[datetime]
    control_count: int
    compliant_controls: int
    partial_controls: int = 0
    non_compliant_controls: int = 0
    not_assessed_controls: int = 0


def _counts_from_totals(totals: Dict[str, Any]) -> Dict[str, int]:
    """Extract the canonical control-status counts from an evaluate response."""
    return {
        "partial_controls": totals.get("partial_controls", 0),
        "non_compliant_controls": totals.get("non_compliant_controls", 0),
        "not_assessed_controls": totals.get("not_assessed_controls", 0),
    }


def _response_from_record(record: ComplianceEvaluationRecord) -> ComplianceEvaluationResponse:
    """Serialize an evaluation record, reading the canonical counts from its
    evidence_summary (where evaluate endpoints stash them) when present. Legacy
    (pre-Phase-5) records are normalized to the canonical 0-100 contract."""
    counts = (record.evidence_summary or {}).get("control_counts", {})
    view = _normalized_record_view(record)
    return ComplianceEvaluationResponse(
        framework_id=record.framework_id,
        overall_score=view["overall_score"],
        compliance_status=view["compliance_status"],
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
        partial_controls=counts.get("partial_controls", 0),
        non_compliant_controls=counts.get("non_compliant_controls", 0),
        not_assessed_controls=counts.get("not_assessed_controls", 0),
    )


class ControlAssessmentResponse(BaseModel):
    """Response model for individual control assessment."""
    control_id: str
    status: str
    score: float
    evidence_provided: List[str]
    evidence_required: List[str]
    gaps: List[str]
    recommendations: List[str]
    assessed_date: datetime
    assessed_by: str


class ComplianceReportResponse(BaseModel):
    """Response model for comprehensive compliance report."""
    evaluation_metadata: Dict[str, Any]
    summary: Dict[str, Any]
    control_details: Dict[str, Any]
    risk_assessment: Dict[str, Any]
    evidence_summary: Dict[str, Any]
    recommendations: List[str]
    next_review: Optional[str]


def _to_control_response(control: SOC2Control) -> ControlResponse:
    """Shared serializer — every control endpoint returns this shape."""
    return ControlResponse(
        id=control.id,
        title=control.title,
        description=control.description,
        category=control.category.value,
        control_objective=control.control_objective,
        implementation_guidance=control.implementation_guidance,
        evidence_mapping=[
            {
                "id": evidence.id,
                "name": evidence.name,
                "description": evidence.description,
                "type": evidence.type,
                "frequency": evidence.frequency,
                "retention_period": evidence.retention_period,
            }
            for evidence in control.evidence_mapping
        ],
        related_controls=control.related_controls,
        risk_level=control.risk_level,
    )


@router.get("/framework/summary", response_model=FrameworkSummaryResponse)
async def get_framework_summary(
    framework: SOC2Framework = Depends(get_soc2_framework),
):
    """Get summary of the SOC 2 control framework."""
    return framework.get_framework_summary()


@router.get("/framework/controls", response_model=List[ControlResponse])
async def get_all_controls(
    framework: SOC2Framework = Depends(get_soc2_framework),
):
    """Get all SOC 2 controls from the framework."""
    return [_to_control_response(c) for c in framework.get_all_controls()]


@router.get("/framework/controls/{control_id}", response_model=ControlResponse)
async def get_control(
    control_id: str,
    framework: SOC2Framework = Depends(get_soc2_framework),
):
    """Get a specific SOC 2 control by ID."""
    control = framework.get_control(control_id)
    if not control:
        raise HTTPException(status_code=404, detail=f"Control {control_id} not found")
    return _to_control_response(control)


@router.get("/framework/controls/by-category/{category}", response_model=List[ControlResponse])
async def get_controls_by_category(
    category: str,
    framework: SOC2Framework = Depends(get_soc2_framework),
):
    """Get all controls for a specific SOC 2 category (CC, A, C, PI, CA)."""
    valid_categories = ["CC", "A", "C", "PI", "CA"]
    if category not in valid_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}",
        )
    return [_to_control_response(c) for c in framework.get_controls_by_category(category)]


@router.get("/framework/controls/search", response_model=List[ControlResponse])
async def search_controls(
    q: str = Query(..., min_length=2),
    framework: SOC2Framework = Depends(get_soc2_framework),
):
    """Search controls by title, description, or objective."""
    return [_to_control_response(c) for c in framework.search_controls(q)]


@router.post("/evaluate", response_model=ComplianceEvaluationResponse)
async def evaluate_compliance(
    request: ComplianceEvaluationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    framework: SOC2Framework = Depends(get_soc2_framework),
):
    """Evaluate compliance and persist results to database.

    Runs through the canonical scoring engine (single scoring path). The
    request's per-control evidence lists are used as the evidence set; the
    canonical engine derives scores, statuses, and coverage from the shared
    framework definitions.
    """
    try:
        evidence_types: List[str] = []
        for evidence in request.evidence_data.values():
            for eid in evidence.evidence_provided or []:
                # evidence IDs in the manual path look like 'CC6.1-E1' — strip the
                # '-E<n>' suffix so they match canonical evidence types, and keep
                # anything that already is a canonical/legacy type verbatim.
                base = eid.split("-")[0] if re.match(r"^[A-Za-z0-9.]+-E\d+$", eid) else eid
                evidence_types.append(base)

        # Persist via the canonical evaluation response.
        totals = evaluate_from_evidence_canonical("soc2", evidence_types)
        evidence_summary = dict(totals.get("evidence_summary") or {})
        evidence_summary["control_counts"] = _counts_from_totals(totals)
        record = ComplianceEvaluationRecord(
            evaluation_id=f"eval-{uuid.uuid4().hex[:12]}",
            framework_id=totals["framework_id"],
            user_id=current_user.id,
            overall_score=totals["overall_score"],
            compliance_status=totals["compliance_status"],
            compliance_level=totals["compliance_level"],
            evaluated_by=request.evaluated_by or "system",
            scope=request.scope or [],
            evidence_summary=evidence_summary,
            risk_assessment=totals["risk_assessment"],
            recommendations=totals["recommendations"],
            control_count=totals["control_count"],
            compliant_controls=totals["compliant_controls"],
        )
        db.add(record)
        db.flush()

        for ctrl_id, ctrl in totals["control_results"].items():
            db.add(ControlAssessmentRecord(
                evaluation_id=record.id,
                control_id=ctrl_id,
                status=ctrl["status"],
                score=ctrl["score"],
                evidence_provided=ctrl["available_evidence"],
                gaps=ctrl["gaps"],
                recommendations=[],
            ))

        db.commit()
        db.refresh(record)

        try:
            from app.services.audit_service import log_event as _log_audit
            _log_audit(
                db,
                "evaluation_run",
                user_id=getattr(current_user, "id", None),
                framework=record.framework_id,
                score=record.overall_score,
                detail={"evaluated_by": record.evaluated_by, "evaluation_id": record.evaluation_id},
            )
        except Exception:
            logger.exception("audit log_event failed for evaluation_run")

        return _response_from_record(record)

    except Exception as exc:
        db.rollback()
        raise EvaluationError(log_message=f"Evaluation failed (user={current_user.email})") from exc


@router.get("/evaluations/history", response_model=List[ComplianceEvaluationResponse])
async def get_evaluation_history(
    current_user: User = Depends(require_pro),
    db: Session = Depends(get_db),
):
    """Get persisted evaluation history for the current user."""
    records = (
        db.query(ComplianceEvaluationRecord)
        .options(selectinload(ComplianceEvaluationRecord.assessments))
        .filter(ComplianceEvaluationRecord.user_id == current_user.id)
        .order_by(ComplianceEvaluationRecord.created_at.desc())
        .limit(50)
        .all()
    )

    return [_response_from_record(r) for r in records]


@router.get("/evaluations/{evaluation_id}/control-assessments", response_model=Dict[str, ControlAssessmentResponse])
async def get_control_assessments(
    evaluation_id: str,
    current_user: User = Depends(require_pro),
    db: Session = Depends(get_db),
):
    """
    Get detailed control assessments for a specific evaluation.

    Only returns assessments belonging to the authenticated user (IDOR-safe).

    Args:
        evaluation_id: The string evaluation_id of the evaluation

    Returns:
        Dictionary of control assessments keyed by control_id

    Raises:
        HTTPException: 404 if evaluation is not found or does not belong to the user
    """
    record = (
        db.query(ComplianceEvaluationRecord)
        .filter(
            ComplianceEvaluationRecord.evaluation_id == evaluation_id,
            ComplianceEvaluationRecord.user_id == current_user.id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail=f"Evaluation {evaluation_id} not found")

    assessment_rows = (
        db.query(ControlAssessmentRecord)
        .filter(ControlAssessmentRecord.evaluation_id == record.id)
        .all()
    )

    legacy = _is_legacy_record(record)
    return {
        row.control_id: ControlAssessmentResponse(
            control_id=row.control_id,
            status=_canonical_status(row.status),
            score=_normalize_control_score(row.score) if legacy else row.score,
            evidence_provided=row.evidence_provided or [],
            evidence_required=[],
            gaps=row.gaps or [],
            recommendations=row.recommendations or [],
            assessed_date=record.created_at,
            assessed_by=record.evaluated_by,
        )
        for row in assessment_rows
    }


@router.get("/controls/{control_id}/trend", response_model=List[Dict[str, Any]])
async def get_control_compliance_trend(
    control_id: str,
    current_user: User = Depends(require_pro),
    db: Session = Depends(get_db),
    framework: SOC2Framework = Depends(get_soc2_framework),
):
    """
    Get compliance trend for a specific control across the current user's evaluations.

    Only returns data belonging to the authenticated user (IDOR-safe).
    """
    control = framework.get_control(control_id)
    if not control:
        raise HTTPException(status_code=404, detail=f"Control {control_id} not found")

    rows = (
        db.query(ControlAssessmentRecord, ComplianceEvaluationRecord)
        .join(
            ComplianceEvaluationRecord,
            ControlAssessmentRecord.evaluation_id == ComplianceEvaluationRecord.id,
        )
        .options(selectinload(ComplianceEvaluationRecord.assessments))
        .filter(
            ControlAssessmentRecord.control_id == control_id,
            ComplianceEvaluationRecord.user_id == current_user.id,
        )
        .order_by(ComplianceEvaluationRecord.created_at.asc())
        .all()
    )

    return [
        {
            "evaluation_id": eval_rec.evaluation_id,
            "score": _normalize_control_score(assessment.score)
            if _is_legacy_record(eval_rec)
            else assessment.score,
            "status": _canonical_status(assessment.status),
            "date": eval_rec.created_at,
        }
        for assessment, eval_rec in rows
    ]


@router.get("/evaluations/{evaluation_id}/report", response_model=ComplianceReportResponse)
async def get_compliance_report(
    evaluation_id: str,
    current_user: User = Depends(require_pro),
    db: Session = Depends(get_db),
):
    """
    Get comprehensive compliance report for an evaluation.

    Only returns reports belonging to the authenticated user (IDOR-safe).

    Args:
        evaluation_id: The string evaluation_id of the evaluation

    Returns:
        Comprehensive compliance report assembled from DB record

    Raises:
        HTTPException: 404 if evaluation is not found or does not belong to the user
    """
    record = (
        db.query(ComplianceEvaluationRecord)
        .filter(
            ComplianceEvaluationRecord.evaluation_id == evaluation_id,
            ComplianceEvaluationRecord.user_id == current_user.id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail=f"Evaluation {evaluation_id} not found")

    view = _normalized_record_view(record)
    report = {
        "evaluation_metadata": {
            "evaluation_id": record.evaluation_id,
            "framework_id": record.framework_id,
            "evaluated_by": record.evaluated_by,
            "evaluation_date": record.created_at.isoformat() if record.created_at else None,
            "scope": record.scope or [],
        },
        "summary": {
            "overall_score": view["overall_score"],
            "compliance_status": view["compliance_status"],
            "compliance_level": record.compliance_level,
            "control_count": record.control_count,
            "compliant_controls": record.compliant_controls,
        },
        "control_details": {},
        "risk_assessment": record.risk_assessment or {},
        "evidence_summary": record.evidence_summary or {},
        "recommendations": record.recommendations or [],
        "next_review": None,
    }
    return report


@router.get("/health")
async def compliance_health_check(
    framework: SOC2Framework = Depends(get_soc2_framework),
):
    """Health check for compliance endpoints."""
    return {
        "status": "healthy",
        "service": "compliance-api",
        "framework_controls": framework.get_control_count(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/evaluate-from-evidence", response_model=ComplianceEvaluationResponse)
async def evaluate_from_evidence(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Evaluate SOC 2 compliance automatically from the user's stored evidence items.

    Runs the canonical coverage engine over the stored evidence (evidence_type
    values are translated from legacy aliases where needed) and persists the
    result.
    """
    from app.models.evidence import EvidenceCollection as EvColl
    from app.models.evidence import EvidenceItem as EvItem

    items = (
        db.query(EvItem)
        .join(EvColl)
        .filter(EvColl.user_id == current_user.id)
        .all()
    )

    evidence_types = [item.evidence_type for item in items]
    totals = evaluate_from_evidence_canonical("soc2", evidence_types)

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
        raise EvaluationError(log_message=f"Evaluation failed (user={current_user.email})") from exc
