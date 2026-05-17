import json
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import require_enterprise
from app.models.user import User
from app.models.enterprise import AuditLog
from app.models.evidence import EvidenceCollection, EvidenceItem
from app.models.evaluation import ComplianceEvaluationRecord
from app.services.audit_service import log_event

router = APIRouter(prefix="/enterprise", tags=["enterprise"])

logger = logging.getLogger(__name__)


def _row_to_dict(obj) -> dict:
    result = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        result[col.name] = val
    return result


def _stream_export(db: Session, user: User):
    """Generator that yields NDJSON lines for all compliance data belonging to `user`."""
    sections = [
        ("evidence_collections", lambda: db.query(EvidenceCollection).filter(EvidenceCollection.user_id == user.id).all(), "evidence_collection"),
        ("evidence_items", lambda: (
            db.query(EvidenceItem)
            .join(EvidenceCollection)
            .filter(EvidenceCollection.user_id == user.id)
            .all()
        ), "evidence_item"),
        ("evaluations", lambda: db.query(ComplianceEvaluationRecord).filter(ComplianceEvaluationRecord.user_id == user.id).all(), "evaluation"),
        ("audit_log", lambda: db.query(AuditLog).filter(
            (AuditLog.user_id == user.id) | (AuditLog.user_id.is_(None))
        ).order_by(AuditLog.id.asc()).all(), "audit_log"),
    ]
    for section_name, query_fn, row_type in sections:
        yield json.dumps({"type": "section", "name": section_name}) + "\n"
        try:
            for row in query_fn():
                yield json.dumps({"type": row_type, **_row_to_dict(row)}, default=str) + "\n"
        except Exception as exc:
            logger.exception("Export section '%s' failed", section_name)
            yield json.dumps({"type": "section_error", "name": section_name, "error": str(exc)}) + "\n"


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
