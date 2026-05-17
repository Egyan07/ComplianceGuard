import hashlib
import json
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.enterprise import AuditLog


def canonical_json(obj: dict) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def compute_entry_hash(
    prev_hash: Optional[str],
    event_type: str,
    user_id: Optional[int],
    framework: Optional[str],
    score: Optional[float],
    detail: dict,
    created_at: str,
) -> str:
    payload_obj = {
        "prev_hash": prev_hash,
        "event_type": event_type,
        "user_id": user_id,
        "framework": framework,
        "score": score,
        "detail": detail if detail else {},
        "created_at": created_at,
    }
    payload = canonical_json(payload_obj).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def log_event(
    db: Session,
    event_type: str,
    user_id: Optional[int] = None,
    framework: Optional[str] = None,
    score: Optional[float] = None,
    detail: Optional[dict] = None,
) -> None:
    last = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last.entry_hash if last else None
    created_at = datetime.utcnow()
    created_at_str = created_at.isoformat()
    entry_hash = compute_entry_hash(prev_hash, event_type, user_id, framework, score, detail or {}, created_at_str)
    # INVARIANT: created_at is always set explicitly (not via server_default) so the
    # hashed created_at_str matches row.created_at.isoformat() on read-back exactly.
    db.add(AuditLog(
        event_type=event_type,
        user_id=user_id,
        framework=framework,
        score=score,
        detail_json=detail or {},
        prev_hash=prev_hash,
        entry_hash=entry_hash,
        created_at=created_at,
    ))
    db.commit()
