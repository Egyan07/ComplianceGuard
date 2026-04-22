"""
Compliance API endpoints for SOC 2 framework management and evaluation.

This module provides FastAPI endpoints for:
- SOC 2 framework management
- Control assessment and evaluation
- Compliance reporting
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid

from app.core.soc2_controls import SOC2Framework, SOC2Control, ControlCategory, create_soc2_framework
from app.services.compliance_service import ComplianceService, ComplianceEvaluation, ComplianceStatus, create_compliance_service
from app.core.database import get_db
from app.api.deps import get_current_user, require_pro
from app.models.user import User
from app.models.evaluation import ComplianceEvaluationRecord, ControlAssessmentRecord


router = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])

# Initialize framework and service
soc2_framework = create_soc2_framework()
compliance_service = create_compliance_service(soc2_framework)


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
    """Response model for compliance evaluation results."""
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
async def get_framework_summary():
    """
    Get summary of the SOC 2 control framework.

    Returns:
        Framework summary including control counts by category and risk distribution
    """
    summary = soc2_framework.get_framework_summary()
    return summary


@router.get("/framework/controls", response_model=List[ControlResponse])
async def get_all_controls():
    """
    Get all SOC 2 controls from the framework.

    Returns:
        List of all SOC 2 controls with their details
    """
    controls = soc2_framework.get_all_controls()
    return [_to_control_response(control) for control in controls]


@router.get("/framework/controls/{control_id}", response_model=ControlResponse)
async def get_control(control_id: str):
    """
    Get a specific SOC 2 control by ID.

    Args:
        control_id: The ID of the control to retrieve

    Returns:
        Detailed information about the specified control

    Raises:
        HTTPException: If control is not found
    """
    control = soc2_framework.get_control(control_id)
    if not control:
        raise HTTPException(status_code=404, detail=f"Control {control_id} not found")

    return _to_control_response(control)


@router.get("/framework/controls/by-category/{category}", response_model=List[ControlResponse])
async def get_controls_by_category(category: str):
    """
    Get all controls for a specific SOC 2 category.

    Args:
        category: The control category (CC, A, C, PI, CA)

    Returns:
        List of controls in the specified category

    Raises:
        HTTPException: If category is invalid
    """
    valid_categories = ["CC", "A", "C", "PI", "CA"]
    if category not in valid_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}"
        )

    controls = soc2_framework.get_controls_by_category(category)
    return [_to_control_response(control) for control in controls]


@router.get("/framework/controls/search", response_model=List[ControlResponse])
async def search_controls(q: str = Query(..., min_length=2)):
    """
    Search controls by title, description, or objective.

    Args:
        q: Search query string

    Returns:
        List of controls matching the search criteria
    """
    controls = soc2_framework.search_controls(q)
    return [_to_control_response(control) for control in controls]


@router.post("/evaluate", response_model=ComplianceEvaluationResponse)
async def evaluate_compliance(
    request: ComplianceEvaluationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Evaluate compliance and persist results to database."""
    try:
        evidence_data = {
            control_id: {
                "evidence_provided": evidence.evidence_provided,
                "status": evidence.status,
                "score": evidence.score,
                "comments": evidence.comments
            }
            for control_id, evidence in request.evidence_data.items()
        }

        evaluation = compliance_service.evaluate_compliance(
            evidence_data=evidence_data,
            scope=request.scope,
            evaluated_by=request.evaluated_by
        )

        compliant_count = sum(
            1 for a in evaluation.control_assessments.values()
            if a.status == ComplianceStatus.COMPLIANT
        )

        # Persist to DB
        record = ComplianceEvaluationRecord(
            evaluation_id=f"eval-{uuid.uuid4().hex[:12]}",
            framework_id=evaluation.framework_id,
            user_id=current_user.id,
            overall_score=evaluation.overall_score,
            compliance_status=evaluation.compliance_status.value,
            compliance_level=evaluation.compliance_level.value,
            evaluated_by=evaluation.evaluated_by,
            scope=evaluation.scope,
            evidence_summary=evaluation.evidence_summary,
            risk_assessment=evaluation.risk_assessment,
            recommendations=evaluation.recommendations,
            control_count=len(evaluation.control_assessments),
            compliant_controls=compliant_count,
        )
        db.add(record)
        db.flush()

        for ctrl_id, assessment in evaluation.control_assessments.items():
            db.add(ControlAssessmentRecord(
                evaluation_id=record.id,
                control_id=ctrl_id,
                status=assessment.status.value,
                score=assessment.score,
                evidence_provided=assessment.evidence_provided,
                gaps=assessment.gaps,
                recommendations=assessment.recommendations,
            ))

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


@router.get("/evaluations/history", response_model=List[ComplianceEvaluationResponse])
async def get_evaluation_history(
    current_user: User = Depends(require_pro),
    db: Session = Depends(get_db),
):
    """Get persisted evaluation history for the current user."""
    records = (
        db.query(ComplianceEvaluationRecord)
        .filter(ComplianceEvaluationRecord.user_id == current_user.id)
        .order_by(ComplianceEvaluationRecord.created_at.desc())
        .limit(50)
        .all()
    )

    return [
        ComplianceEvaluationResponse(
            framework_id=r.framework_id,
            overall_score=r.overall_score,
            compliance_status=r.compliance_status,
            compliance_level=r.compliance_level,
            evaluation_date=r.created_at,
            evaluated_by=r.evaluated_by,
            scope=r.scope or [],
            evidence_summary=r.evidence_summary or {},
            risk_assessment=r.risk_assessment or {},
            recommendations=r.recommendations or [],
            next_review_date=None,
            control_count=r.control_count,
            compliant_controls=r.compliant_controls,
        )
        for r in records
    ]


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

    return {
        row.control_id: ControlAssessmentResponse(
            control_id=row.control_id,
            status=row.status,
            score=row.score,
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
):
    """
    Get compliance trend for a specific control across the current user's evaluations.

    Only returns data belonging to the authenticated user (IDOR-safe).

    Args:
        control_id: The ID of the control
        current_user: Authenticated user (Pro tier required)
        db: Database session

    Returns:
        List of {evaluation_id, score, status, date} dicts ordered by date
    """
    control = soc2_framework.get_control(control_id)
    if not control:
        raise HTTPException(status_code=404, detail=f"Control {control_id} not found")

    rows = (
        db.query(ControlAssessmentRecord, ComplianceEvaluationRecord)
        .join(
            ComplianceEvaluationRecord,
            ControlAssessmentRecord.evaluation_id == ComplianceEvaluationRecord.id,
        )
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
            "score": assessment.score,
            "status": assessment.status,
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

    report = {
        "evaluation_metadata": {
            "evaluation_id": record.evaluation_id,
            "framework_id": record.framework_id,
            "evaluated_by": record.evaluated_by,
            "evaluation_date": record.created_at.isoformat() if record.created_at else None,
            "scope": record.scope or [],
        },
        "summary": {
            "overall_score": record.overall_score,
            "compliance_status": record.compliance_status,
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
async def compliance_health_check():
    """
    Health check for compliance endpoints.

    Returns:
        Service health status
    """
    return {
        "status": "healthy",
        "service": "compliance-api",
        "framework_controls": soc2_framework.get_control_count(),
        "evaluations_performed": len(compliance_service.evaluations),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
