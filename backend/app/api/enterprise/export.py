import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import require_enterprise
from app.models.user import User
from app.models.enterprise import AuditLog
from app.services.audit_service import log_event

router = APIRouter(prefix="/enterprise", tags=["enterprise"])


def _row_to_dict(obj) -> dict:
    result = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        result[col.name] = val
    return result


def _stream_export(db: Session, user: User):
    # Evidence collections
    try:
        from app.models.evidence import EvidenceCollection
        yield json.dumps({"type": "section", "name": "evidence_collections"}) + "\n"
        for row in db.query(EvidenceCollection).filter(EvidenceCollection.user_id == user.id).all():
            yield json.dumps({"type": "evidence_collection", **_row_to_dict(row)}) + "\n"
    except Exception:
        pass

    # Evidence items
    try:
        from app.models.evidence import EvidenceCollection, EvidenceItem
        yield json.dumps({"type": "section", "name": "evidence_items"}) + "\n"
        for row in (
            db.query(EvidenceItem)
            .join(EvidenceCollection)
            .filter(EvidenceCollection.user_id == user.id)
            .all()
        ):
            yield json.dumps({"type": "evidence_item", **_row_to_dict(row)}) + "\n"
    except Exception:
        pass

    # Evaluations
    try:
        from app.models.evaluation import ComplianceEvaluationRecord
        yield json.dumps({"type": "section", "name": "evaluations"}) + "\n"
        for row in db.query(ComplianceEvaluationRecord).filter(ComplianceEvaluationRecord.user_id == user.id).all():
            yield json.dumps({"type": "evaluation", **_row_to_dict(row)}) + "\n"
    except Exception:
        pass

    # Audit log
    yield json.dumps({"type": "section", "name": "audit_log"}) + "\n"
    for row in db.query(AuditLog).order_by(AuditLog.id.asc()).all():
        yield json.dumps({"type": "audit_log", **_row_to_dict(row)}) + "\n"


@router.get("/export")
def export_data(
    current_user: User = Depends(require_enterprise),
    db: Session = Depends(get_db),
):
    log_event(db, "export_generated", user_id=current_user.id, detail={"triggered_by": current_user.email})
    return StreamingResponse(
        _stream_export(db, current_user),
        media_type="application/x-ndjson",
        headers={"Content-Disposition": "attachment; filename=complianceguard-export.ndjson"},
    )
