from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from app.core.database import get_db
from app.api.deps import require_admin
from app.models.user import User
from app.models.enterprise import AuditLog
from app.services.audit_service import compute_entry_hash, canonical_timestamp

router = APIRouter(prefix="/enterprise", tags=["enterprise"])


@router.get("/audit-log")
def list_audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    event_type: Optional[str] = None,
    framework: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog)
    if event_type:
        q = q.filter(AuditLog.event_type == event_type)
    if framework:
        q = q.filter(AuditLog.framework == framework)
    if date_from:
        q = q.filter(AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(AuditLog.created_at <= date_to)
    total = q.count()
    rows = q.order_by(AuditLog.id.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "entries": [
            {
                "id": r.id,
                "event_type": r.event_type,
                "user_id": r.user_id,
                "framework": r.framework,
                "score": r.score,
                "detail_json": r.detail_json,
                "entry_hash": r.entry_hash,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/audit-log/verify")
def verify_audit_chain(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # Stream rows in batches (audit_log grows unbounded — DELETE is revoked) so
    # verify doesn't load the whole table into memory at once.
    prev_hash = None
    checked = 0
    for row in db.query(AuditLog).order_by(AuditLog.id.asc()).yield_per(500):
        expected = compute_entry_hash(
            prev_hash,
            row.event_type,
            row.user_id,
            row.framework,
            row.score,
            row.detail_json or {},
            canonical_timestamp(row.created_at),
        )
        if row.entry_hash != expected or row.prev_hash != prev_hash:
            return {"valid": False, "entries_checked": checked, "first_broken_at": row.id}
        prev_hash = row.entry_hash
        checked += 1

    return {"valid": True, "entries_checked": checked, "first_broken_at": None}


@router.get("/audit-log/{entry_id}")
def get_audit_log_entry(
    entry_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException
    row = db.query(AuditLog).filter(AuditLog.id == entry_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Audit log entry not found")
    return {
        "id": row.id,
        "event_type": row.event_type,
        "user_id": row.user_id,
        "framework": row.framework,
        "score": row.score,
        "detail_json": row.detail_json,
        "entry_hash": row.entry_hash,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
