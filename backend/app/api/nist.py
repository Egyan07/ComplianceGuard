"""
NIST CSF 2.0 API - browse the subcategories and evaluate stored evidence.

NIST has no ORM-backed framework class like SOC 2, ISO 27001, HIPAA and GDPR, so
this module serves the same canonical YAML that the engine, the desktop framework
browser and the generated frontend evidence catalog all read, and scores through
the shared canonical engine.

The browse endpoints are read-only. POST /evaluate-from-evidence mirrors the other
four frameworks' endpoints: the user's stored evidence items go through
`evaluate_from_evidence_canonical` and the result is persisted, so the dashboard,
history and trend views treat NIST like any other framework.
"""

import os
import uuid
from typing import List, Optional

import yaml
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.compliance import (
    ComplianceEvaluationResponse,
    _counts_from_totals,
    _response_from_record,
)
from app.api.deps import get_current_user
from app.core.canonical_router import evaluate_from_evidence_canonical
from app.core.database import get_db
from app.core.exceptions import EvaluationError
from app.core.shared_frameworks import SHARED_FRAMEWORKS_DIR
from app.models.evaluation import ComplianceEvaluationRecord
from app.models.user import User

router = APIRouter(prefix="/nist", tags=["nist"])

_YAML_NAME = "nist_csf2_controls.yaml"


class NISTControlResponse(BaseModel):
    id: str
    title: str
    description: str
    category: str
    control_objective: str
    implementation_guidance: str
    risk_level: str
    assessment_mode: Optional[str] = None


def _load_controls() -> List[dict]:
    path = os.path.join(SHARED_FRAMEWORKS_DIR, _YAML_NAME)
    with open(path, encoding="utf-8") as fh:
        return (yaml.safe_load(fh) or {}).get("controls") or []


@router.get("/framework/controls", response_model=List[NISTControlResponse])
async def get_all_controls():
    """Every NIST CSF 2.0 subcategory in the canonical table."""
    return [
        {
            "id": control["id"],
            "title": control["title"],
            "description": control["description"],
            "category": control["category"],
            "control_objective": control.get("control_objective", ""),
            "implementation_guidance": control.get("implementation_guidance", ""),
            "risk_level": control.get("risk_level") or "medium",
            "assessment_mode": control.get("assessment_mode"),
        }
        for control in _load_controls()
    ]


@router.post("/evaluate-from-evidence", response_model=ComplianceEvaluationResponse)
async def evaluate_from_evidence(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Auto-evaluate NIST CSF 2.0 readiness from the user's stored evidence items.

    Scope is the set of Functions in the canonical table (GV, ID, PR, DE, RS,
    RC) rather than an ORM framework object, because NIST controls live in the
    shared YAML that both scoring engines read.
    """
    from app.models.evidence import EvidenceCollection as EvColl, EvidenceItem as EvItem

    items = (
        db.query(EvItem)
        .join(EvColl)
        .filter(EvColl.user_id == current_user.id)
        .all()
    )

    # Canonical coverage engine (single scoring path).
    evidence_types = [item.evidence_type for item in items]
    totals = evaluate_from_evidence_canonical("nist", evidence_types)

    try:
        evidence_summary = {"total_evidence": len(items)}
        evidence_summary["control_counts"] = _counts_from_totals(totals)
        # Per-control results (score/status/gaps/assessment_mode) so web
        # clients can render the ControlHeatmap without a second engine port.
        evidence_summary["control_results"] = totals.get("control_results") or {}
        record = ComplianceEvaluationRecord(
            evaluation_id=f"eval-{uuid.uuid4().hex[:12]}",
            # Resolved from the canonical YAML (nist_csf_2_0).
            framework_id=totals["framework_id"],
            user_id=current_user.id,
            overall_score=totals["overall_score"],
            compliance_status=totals["compliance_status"],
            compliance_level=totals["compliance_level"],
            evaluated_by="web_auto",
            scope=sorted({c["category"] for c in _load_controls()}),
            evidence_summary=evidence_summary,
            risk_assessment={},
            recommendations=totals["recommendations"],
            control_count=totals["control_count"],
            compliant_controls=totals["compliant_controls"],
            taxonomy_version=totals.get("taxonomy_version"),
            score_semantics=totals.get("score_semantics"),
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        return _response_from_record(record)
    except Exception as exc:
        db.rollback()
        raise EvaluationError(log_message=f"NIST CSF 2.0 evaluation failed (user={current_user.email})") from exc
